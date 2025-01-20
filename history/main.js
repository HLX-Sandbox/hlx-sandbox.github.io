map = L.map("map", {
    renderer: L.canvas(),
}).setView([38.7033459, -9.1638052], 12);

L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    minZoom: 9,
    attribution: '© OpenStreetMap',
    useCache: true,
    saveToCache: true,
    useOnlyCache: false
}).addTo(map);

let { rg, id, date } = new Proxy(new URLSearchParams(window.location.search), { get: (searchParams, prop) => searchParams.get(prop) });

let vehicleMeta;
fetch(API_BASE + "vehicles").then(r => r.json()).then(r => vehicleMeta = r)


let timeline = document.getElementById("timeline")

let stops = [];

stops = fetch(CLOUDFLARED + "stops").then(r => r.json()).catch(() => fetch("https://api.cmet.pt/stops").then(r => r.json()))

let tripIndexes = [];

let patternCache = [];

let lastIndex;

let routeSection;

let route;

const CustomCanvasLayer = L.Layer.extend({
    initialize: function () {
        this._data = []; // Store marker data
    },

    onAdd: function (map) {
        this._map = map;

        const canvas = L.DomUtil.create('canvas', 'leaflet-custom-layer');
        const size = this._map.getSize();
        canvas.width = size.x;
        canvas.height = size.y;
        canvas.style.position = 'absolute';

        this._canvas = canvas;
        this._ctx = canvas.getContext('2d');

        map.getPanes().overlayPane.appendChild(this._canvas);

        map.on('viewreset', this._reset, this);
        map.on('move', this._update, this);

        this._reset();
    },


    onRemove: function (map) {
        L.DomUtil.remove(this._canvas);
        map.off('viewreset', this._reset, this);
        map.off('move', this._update, this);
    },

    _reset: function () {
        const bounds = this._map.getBounds();
        const topLeft = this._map.latLngToLayerPoint(bounds.getNorthWest());
        const size = this._map.getSize();

        const buffer = 100;
        const expandedSize = size.add([buffer * 2, buffer * 2]);

        this._canvas.width = expandedSize.x;
        this._canvas.height = expandedSize.y;

        L.DomUtil.setPosition(this._canvas, topLeft.subtract([buffer, buffer]));

        this._redraw();
    },

    _update: function () {
        this._reset();
    },

    _redraw: function () {
        const ctx = this._ctx;
        const map = this._map;
        const buffer = 100;
        alpha = 1;
        const bounds = map.getBounds();
        const topLeft = map.latLngToLayerPoint(bounds.getNorthWest());
        ctx.clearRect(0, 0, this._canvas.width, this._canvas.height);
        if (routeSection) {
            if (!route) return;
            ctx.strokeStyle = route.col;
            if (route.col === "#000000") ctx.strokeStyle = "#00000000";
            ctx.lineWidth = 10;
            ctx.lineJoin = "round";
            ctx.lineCap = "round";
            ctx.beginPath();
            for (let i = 0; i < routeSection.length - 1; i++) {
                pointA = routeSection[i]
                pointB = routeSection[i + 1]
                posA = map.latLngToLayerPoint([pointA.lat, pointA.lon]);
                adjustedPosA = posA.subtract(topLeft).add([buffer, buffer]);
                posB = map.latLngToLayerPoint([pointB.lat, pointB.lon]);
                adjustedPosB = posB.subtract(topLeft).add([buffer, buffer]);
                if ((adjustedPosA.x < 0 && adjustedPosB.x < 0) || (adjustedPosA.x > ctx.width && adjustedPosB.x > ctx.width) || (adjustedPosA.y < 0 && adjustedPosB.y < 0) || (adjustedPosA.y > ctx.height && adjustedPosB.y > ctx.height)) continue;
                if (Math.abs(pointA.lat - pointB.lat) > 0.05 || Math.abs(pointA.lon - pointB.lon) > 0.05) continue;
                ctx.beginPath();
                ctx.moveTo(adjustedPosA.x, adjustedPosA.y);
                ctx.lineTo(adjustedPosB.x, adjustedPosB.y)
                ctx.strokeStyle = route.color + Math.round(alpha * 255).toString("16").padStart(2, "0");
                ctx.stroke();
                ctx.moveTo(adjustedPosB.x, adjustedPosB.y)
            }
            ctx.stroke()
            alpha = 1
            ctx.globalAlpha = 1;
            const pos = map.latLngToLayerPoint([routeSection[routeSection.length - 1].lat, routeSection[routeSection.length - 1].lon]);
            const adjustedPos = pos.subtract(topLeft).add([buffer, buffer]);
            if (
                adjustedPos.x >= 0 &&
                adjustedPos.y >= 0 &&
                adjustedPos.x <= this._canvas.width &&
                adjustedPos.y <= this._canvas.height
            ) {

                ctx.font = 'bold 10px sans-serif';
                ctx.textAlign = 'center';
                ctx.textBaseline = 'top';

                ctx.fillStyle = route.col + Math.round(alpha * 255).toString(16).padStart(2, '0');
                ctx.beginPath();
                ctx.arc(adjustedPos.x - 20, adjustedPos.y + 5, 10, Math.PI / 2, Math.PI * 3 / 2)
                ctx.lineTo(adjustedPos.x + 20, adjustedPos.y - 5);
                ctx.arc(adjustedPos.x + 20, adjustedPos.y + 5, 10, Math.PI * 3 / 2, Math.PI / 2)
                ctx.lineTo(adjustedPos.x - 20, adjustedPos.y + 15);
                ctx.fill();

                ctx.fillStyle = "#ffffff" + Math.round(alpha * 255).toString(16).padStart(2, '0');
                ctx.fillText(route.text.replaceAll("1998", "CP"), adjustedPos.x, adjustedPos.y);
            }
        };
    },
});

customLayer = new CustomCanvasLayer().addTo(map);

function getDateInUTC4(force) {
    if (date && !force) return date;
    let n = new Date();

    const utcMillis = n.getTime() + n.getTimezoneOffset() * 60000;

    const utcMinus4 = new Date(utcMillis - 4 * 60 * 60000);
    const day = String(utcMinus4.getDate()).padStart(2, "0");
    const month = String(utcMinus4.getMonth() + 1).padStart(2, "0");
    const year = utcMinus4.getFullYear();

    return `${day}${month}${year}`;
}

async function main() {

    let vehicles = await fetch(CLOUDFLARED + "vehicles").then(r => r.json());
    let shift = (await fetch(CLOUDFLARED + "t/vehicles/" + (date || getDateInUTC4()) + "/").then(r => r.text())).split("\n")
    if (!shift) {
        alert("Veículo não encontrado");
        window.location.href = "/vehicles";
    }
    let shifts = shift.filter(a => a.split(">")[0] === rg + "|" + id).map(a => a.split(">")[1]);
    shifts = [...new Set(shifts)]
    let vec = vehicles.find(a => a.id === rg + "|" + id);
    if (!vec || !vec.shiftId) {
        alert("Veículo não encontrado");
        window.location.href = "/vehicles";
    }
    shifts.push(vec.a + "-" + vec.shiftId);
    tripIndexes = []
    for(let shift of shifts) {
        s = await fetch(CLOUDFLARED + "t/shift/" + shift + "/current").then(r => r.json());
        trips = (await fetch(CLOUDFLARED + "t/shift/" + getDateInUTC4() + "/" + shift + "/trips").then(r => r.text())).split("\n") || [];
        tripsData = (await fetch(CLOUDFLARED + "t/shift-trip/" + getDateInUTC4() + "/" + shift + "/trips").then(r => r.text())).replaceAll("\n$", "\n§").split("\n") || [];
        if (s.data.pos.startsWith("@")) s.data.pos = s.data.pos.slice(1)
        trip = { nodes: s.data.pos.slice(0, -1).split("@"), pattern: s.data.pattern, id: s.data.id, start: s.data.start }
        
        if (trips[0] === "Not Found") trips = []

        now = Math.floor(Date.now() / 1000)

        trip.nodes = trip.nodes.map(a => a.split("|")).map(a => ({ lat: parseFloat(a[0]), lon: parseFloat(a[1]), stop: (a[2] || null), timestamp: parseInt(a[4]) }))

        trips.forEach(t => {
            
            let info = t.split("-")
            let ti = tripsData.find(a => a.startsWith("§" + info[2])).slice(1).slice(0, -1).split("<")
            tripIndexes.push({ p: ti[1], t: ti[4].split("@").map(a => a.split("|")).map(a => ({ lat: parseFloat(a[0]), lon: parseFloat(a[1]), stop: (a[2] || null), timestamp: parseInt(a[4]) })), trip: ti[0], d: parseInt(ti[2]), len: parseInt(ti[3]) - parseInt(ti[2]), s: shift })
        })
    }

    let today = !date || getDateInUTC4(true) === date;    
    if (today) tripIndexes.push({ p: trip.pattern, t: trip.nodes, trip: trip.id, d: trip.start, len: trip.nodes[trip.nodes.length - 1].timestamp, s: vec.a + "-" + vec.shiftId })
    tripIndexes.map(async (p, i) => {
        if (!patternCache[p.p]) patternCache[p.p] = fetch(CLOUDFLARED + "patterns/" + p.p).then(r => r.json());
    })

    if (tripIndexes.length === 0) {
        alert("Este veículo não tem histórico de viagens para esta data.");
        window.location.href = "/vehicles";
    }

    console.log(tripIndexes)

    let max = (tripIndexes[tripIndexes.length - 1].d + tripIndexes[tripIndexes.length - 1].len) - tripIndexes[0].d

    tripIndexes = tripIndexes.sort((a, b) => a.d - b.d)
    trip = tripIndexes[tripIndexes.length - 1]
    let slider = timeline.querySelector("#slider");
    slider.max = max;
    start = tripIndexes[0].d;
    routeSection = tripIndexes.find(a => (a.d - start + a.len) >= max).t.filter(a => a.timestamp <= max)

    timeline.querySelector("#start").innerHTML = parseTime(start)
    timeline.querySelector("#end").innerHTML = parseTime(start + max)
    slider.value = max;
    timeline.querySelector("#current").innerHTML = parseTime(start + max)

    tmtxt = (await Promise.all(tripIndexes.map(async (a, i) => {
        if (patternCache[a.p].then) patternCache[a.p] = await Promise.resolve(patternCache[a.p]);
        if (a.len === 0 || max === 0) a.len = max = 1;
        let offset = a.d - (tripIndexes[i - 1] ? (tripIndexes[i - 1].d) : start);
        let prevLen = tripIndexes[i - 1] ? tripIndexes[i - 1].len : 0;
        let d = "";
        let d2 = "";
        if (offset) {
            d = "<div style=\"background-color: #0000003f; width:" + Math.round((offset - prevLen) / max * 10000) / 100 + "%\"><span class=\"line\" style=\"background-color: #000000;\">N/A</span></div>"
            d2 = "<div style=\"background-color: #0000003f; width:" + Math.round((offset - prevLen) / max * 10000) / 100 + "%\">Sem dados</div>"
        }
        d += "<div style=\"background-color:" + patternCache[a.p].color + "3f; width:" + Math.round(a.len / max * 10000) / 100 + "%\"><span class=\"line\" style=\"background-color: " + patternCache[a.p].color + ";\">" + a.p.split("_")[0].replaceAll("1998", "CP") + "</span></div>"
        d2 += "<div style=\"background-color:" + patternCache[a.p].color + "3f; width:" + Math.round(a.len / max * 10000) / 100 + "%\">" + a.s + "</span></div>"
        
        return [d, d2];
    }))).reduce((acc, val) => [acc[0] + val[0], acc[1] + val[1]], ["", ""])
    console.log(tmtxt)
    timeline.querySelector("#services").innerHTML = tmtxt[0];
    timeline.querySelector("#shifts").innerHTML = tmtxt[1];


    route = tripIndexes.filter(a => (a.d - start + a.len) >= max).map(a => ({ ...a, text: a.p.split("_")[0], col: patternCache[a.p].color }))[0]
    outOfService = false;
    if (stops.then) stops = await Promise.resolve(stops)

    info.querySelector("#line").innerHTML = (outOfService ? "N/A" : route.text.replaceAll("1998", "CP"))
    info.querySelector("#line").style = "background-color: " + (outOfService ? "#000000" : route.col) + ";"
    info.querySelector("#dest").innerHTML = outOfService ? "Fora de serviço" : patternCache[route.p].long_name || "Carregando..."
    info.querySelector("#vec").innerHTML = "# veículo: " + rg + "|" + id
    info.querySelector("#vec2").innerHTML = "<strong>" + (vehicleMeta.find(a => a.id === rg + "|" + id) || { make: "NULL" }).make + "</strong> " + (vehicleMeta.find(a => a.id === rg + "|" + id) || { model: "NULL" }).model
    info.querySelector("#stop").innerHTML = stops.find(a => a.id === route.t.filter(a => a.stop)[route.t.filter(a => a.stop).length - 1].stop).name || "Sem paragem"
    info.querySelector("#lines").innerHTML = stops.find(a => a.id === route.t.filter(a => a.stop)[route.t.filter(a => a.stop).length - 1].stop).lines.reduce((acc, val) => acc + "<span class=\"line\" style=\"background-color: " + (val.color || "#000000") + ";\">" + val.text.replaceAll("1998", "CP") + "</span>", "")
    info.querySelector("#trip").innerHTML = route.trip
    customLayer._redraw()

    slider.addEventListener("input", function () {
        timeline.querySelector("#current").innerHTML = parseTime(start + parseInt(slider.value))
        trip = tripIndexes.filter(a => a.d + a.len >= start + parseInt(slider.value) && a.d <= start + parseInt(slider.value));
        if (trip.length === 0) {
            trip = tripIndexes.filter(a => a.d + a.len <= start + parseInt(slider.value)).reverse();
            routeSection = trip[0].t;
            outOfService = true
        } else {
            routeSection = trip[0].t.filter(a => a.timestamp + trip[0].d <= start + parseInt(slider.value))
            outOfService = false
        }
        route = trip.map(a => ({ ...a, text: a.p.split("_")[0], col: patternCache[a.p].color }))[0]
        if (outOfService) {
            route.col = "#000000";
            route.text = rg + "|" + id;
        }
        customLayer._redraw()
    });

    slider.addEventListener("change", function () {
        info.querySelector("#line").innerHTML = (outOfService ? "N/A" : route.text)
        info.querySelector("#line").style = "background-color: " + (outOfService ? "#000000" : route.col) + ";"
        info.querySelector("#dest").innerHTML = outOfService ? "Fora de serviço" : patternCache[route.p].long_name || "Carregando..."
        info.querySelector("#vec").innerHTML = "# veículo: " + rg + "|" + id
        info.querySelector("#vec2").innerHTML = "<strong>" + (vehicleMeta.find(a => a.id === rg + "|" + id) || { make: "NULL" }).make + "</strong> " + (vehicleMeta.find(a => a.id === rg + "|" + id) || { model: "NULL" }).model
        info.querySelector("#stop").innerHTML = (outOfService ? "Sem dados" : stops.find(a => a.id === routeSection.filter(a => a.stop)[routeSection.filter(a => a.stop).length - 1].stop).name || "Sem paragem")
        info.querySelector("#lines").innerHTML = (outOfService ? "" : stops.find(a => a.id === routeSection.filter(a => a.stop)[routeSection.filter(a => a.stop).length - 1].stop).lines.reduce((acc, val) => acc + "<span class=\"line\" style=\"background-color: " + (val.color || "#000000") + ";\">" + val.text + "</span>", ""))
        info.querySelector("#trip").innerHTML = (outOfService ? "N/A" : route.trip)
    })
}



function parseTime(t) {
    h = Math.floor(t / 3600) % 24;
    t %= 3600;
    m = Math.floor(t / 60);
    t %= 60;
    s = t;
    return h.toString().padStart(2, "0") + ":" + m.toString().padStart(2, "0") + ":" + s.toString().padStart(2, "0")
}

main();