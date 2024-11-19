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

let { rg, id, extended } = new Proxy(new URLSearchParams(window.location.search), { get: (searchParams, prop) => searchParams.get(prop) });

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
            ctx.strokeStyle = route.col;
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
                if((adjustedPosA.x < 0 && adjustedPosB.x < 0) || (adjustedPosA.x > ctx.width && adjustedPosB.x > ctx.width) || (adjustedPosA.y < 0 && adjustedPosB.y < 0) || (adjustedPosA.y > ctx.height && adjustedPosB.y > ctx.height)) continue;
                if(Math.abs(pointA.lat - pointB.lat) > 0.05 || Math.abs(pointA.lon - pointB.lon) > 0.05) continue;
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
                ctx.fillText(route.text, adjustedPos.x, adjustedPos.y);
            }
        };
    },
});

customLayer = new CustomCanvasLayer().addTo(map);

async function main() {
    trip = await fetch(CLOUDFLARED + "sandbox/vehicles/" + rg + "/" + id + "/trip").then(r => r.json());
    fetch(CLOUDFLARED + "sandbox/trip-history/now/data").then(r => r.text()).then(async tripFull => {
        tripFull = tripFull.split("\n=").filter(a => a.endsWith("<ID:" + rg + "|" + id + ">"))[0]
        tripFull = tripFull.split("\n")
        tripFull = tripFull.slice(1, -1)
        await Promise.all(tripFull.reverse().map(async t => {
            t = t.split("@")
            let data = {p: t[2], d: parseInt(t[3]), trip: t[0], pos: t[1].split("+").map(a => parseFloat(a)), t: ("0|" + t[4]).split(":").map(a => a.split("|"))}
            data.t = data.t.map(a => ({lat: parseFloat(data.pos[0]) + parseFloat(a[1]) +38.7169, lon: parseFloat(data.pos[1]) + parseFloat(a[2]) -9.1395, stop: (a[3] || null), timestamp: parseInt(a[0]) }))
            data.dif = start - data.d;
            data.len = data.t[data.t.length - 1].timestamp
            max += data.dif;
            start = data.d;
            timeline.querySelector("#start").innerHTML = parseTime(start)
            timeline.querySelector("#end").innerHTML = parseTime(start + max)
            slider.max = max;
            slider.value = parseInt(slider.value) + data.dif;
            timeline.querySelector("#current").innerHTML = parseTime(start + max)
            tripIndexes.unshift(data)
        }));
        tripIndexes = tripIndexes.sort((a, b) => a.d - b.d)
        timeline.querySelector("#services").innerHTML = (await Promise.all(tripIndexes.map(async (a, i) => {
            if(!patternCache[a.p]) patternCache[a.p] = fetch(CLOUDFLARED + "patterns/" + a.p).then(r => r.json());
            if(patternCache[a.p].then) patternCache[a.p] = await Promise.resolve(patternCache[a.p]);
            t = "<div style=\"background-color:" + patternCache[a.p].color + "3f; width:" + Math.round(a.dif/max*10000)/100 + "%\"><span class=\"line\" style=\"background-color: " + patternCache[a.p].color + ";\">" + a.p.split("_")[0].replaceAll("1998","CP") + "</span></div>"
            return t;
        }))).reduce((acc, val) => acc + val, "")

        if(extended && extended === "1") {
            fetch(CLOUDFLARED + "sandbox/trip-history/" + (new Date(Date.now() - 24*60*60*1000)).toLocaleDateString("en-GB").replaceAll("/","") + "/data").then(r => r.text()).then(async tripFull => {
                tripFull = tripFull.split("\n=").filter(a => a.endsWith("<ID:" + rg + "|" + id + ">"))[0]
                tripFull = tripFull.split("\n")
                tripFull = tripFull.slice(1, -1)
                await Promise.all(tripFull.reverse().map(async t => {
                    t = t.split("@")
                    let data = {p: t[2], d: parseInt(t[3]), trip: t[0], pos: t[1].split("+").map(a => parseFloat(a)), t: ("0|" + t[4]).split(":").map(a => a.split("|"))}
                    data.t = data.t.map(a => ({lat: parseFloat(data.pos[0]) + parseFloat(a[1]) +38.7169, lon: parseFloat(data.pos[1]) + parseFloat(a[2]) -9.1395, stop: (a[3] || null), timestamp: parseInt(a[0]) }))
                    data.dif = start - data.d;
                    data.len = data.t[data.t.length - 1].timestamp
                    max += data.dif;
                    start = data.d;
                    timeline.querySelector("#start").innerHTML = parseTime(start)
                    timeline.querySelector("#end").innerHTML = parseTime(start + max)
                    slider.max = max;
                    slider.value = parseInt(slider.value) + data.dif;
                    timeline.querySelector("#current").innerHTML = parseTime(start + max)
                    tripIndexes.unshift(data)
                }));
                tripIndexes = tripIndexes.sort((a, b) => a.d - b.d)
                timeline.querySelector("#services").innerHTML = (await Promise.all(tripIndexes.map(async (a, i) => {
                    if(!patternCache[a.p]) patternCache[a.p] = fetch(CLOUDFLARED + "patterns/" + a.p).then(r => r.json());
                    if(patternCache[a.p].then) patternCache[a.p] = await Promise.resolve(patternCache[a.p]);
                    t = "<div style=\"background-color:" + patternCache[a.p].color + "3f; width:" + Math.round(a.dif/max*10000)/100 + "%\"><span class=\"line\" style=\"background-color: " + patternCache[a.p].color + ";\">" + a.p.split("_")[0].replaceAll("1998","CP") + "</span></div>"
                    return t;
                }))).reduce((acc, val) => acc + val, "")
            });
        }
    });
    trip.nodes[0] = "0|" + trip.nodes[0]
    trip.nodes = trip.nodes.map(a => a.split("|")).map(a => ({lat: parseFloat(trip.pos[0]) + parseFloat(a[1]) +38.7169, lon: parseFloat(trip.pos[1]) + parseFloat(a[2]) -9.1395, stop: (a[3] || null), timestamp: parseInt(a[0]) }))

    tripIndexes.push({p: trip.pattern_id, t: trip.nodes, trip: trip.lastTrip, d: trip.d, len: trip.nodes[trip.nodes.length - 1].timestamp, dif: trip.nodes[trip.nodes.length - 1].timestamp})
    tripIndexes.map(async p => {
        if(!patternCache[p.p]) patternCache[p.p] = fetch(CLOUDFLARED + "patterns/" + p.p).then(r => r.json());
    })
    tripIndexes = tripIndexes.sort((a, b) => a.d - b.d)
    now = Math.floor(Date.now()/1000)
    let slider = timeline.querySelector("#slider");
    let len = trip.nodes.length;
    let max = trip.nodes[len-1].timestamp;
    slider.max = max;
    start = trip.d;
    routeSection = tripIndexes.filter(a => a.d < a.d + max)[0].t.filter(a => a.timestamp <= max)

    timeline.querySelector("#start").innerHTML = parseTime(start)
    timeline.querySelector("#end").innerHTML = parseTime(start + max)
    slider.value = trip.nodes[len-1].timestamp;
    timeline.querySelector("#current").innerHTML = parseTime(start + max)
    timeline.querySelector("#services").innerHTML = (await Promise.all(tripIndexes.map(async (a, i) => {
        if(patternCache[a.p].then) patternCache[a.p] = await Promise.resolve(patternCache[a.p]);
        return "<div style=\"background-color:" + patternCache[a.p].color + "3f; width:" + Math.round(a.len/max*10000)/100 + "%\"><span class=\"line\" style=\"background-color: " + patternCache[a.p].color + ";\">" + a.p.split("_")[0].replaceAll("1998","CP") + "</span></div>"
    }))).reduce((acc, val) => acc + val, "")

    route = tripIndexes.filter(a => a.d <= a.d + max).map(a => ({...a, text: a.p.split("_")[0], col: patternCache[a.p].color}))[0]

    if(stops.then) stops = await Promise.resolve(stops)

    info.querySelector("#line").innerHTML = route.text
    info.querySelector("#line").style = "background-color: " + route.col + ";"
    info.querySelector("#dest").innerHTML = patternCache[route.p].long_name //outOfService ? "Fora de serviço" : headsignCache[vehicles.find(a => a.id === point.id).tripId.replaceAll("|", "_").split("_").slice(0, 3).join("_").replaceAll("C", "3")] || "Carregando..."
    info.querySelector("#vec").innerHTML = "# veículo: " + rg + "|" + id
    info.querySelector("#stop").innerHTML = stops.find(a => a.id === route.t.filter(a => a.stop)[route.t.filter(a => a.stop).length - 1].stop).name || "Sem paragem"
    info.querySelector("#lines").innerHTML = stops.find(a => a.id === route.t.filter(a => a.stop)[route.t.filter(a => a.stop).length - 1].stop).lines.reduce((acc, val) => acc + "<span class=\"line\" style=\"background-color: " + (val.color || "#000000") + ";\">" + val.text + "</span>", "")
    info.querySelector("#trip").innerHTML = route.trip
    customLayer._redraw()

    slider.addEventListener("input", function () {
        timeline.querySelector("#current").innerHTML = parseTime(start + parseInt(slider.value))
        trip = tripIndexes.filter(a => a.d + a.len >= start + parseInt(slider.value) && a.d <= start + parseInt(slider.value));
        if(trip.length === 0) {
            trip = tripIndexes.filter(a => a.d + a.len <= start + parseInt(slider.value)).reverse();
            routeSection = trip[0].t;
        } else {
            routeSection = trip[0].t.filter(a => a.timestamp + trip[0].d <= start + parseInt(slider.value))
        }
        route = trip.map(a => ({...a, text: a.p.split("_")[0], col: patternCache[a.p].color}))[0]
        customLayer._redraw()
    });

    slider.addEventListener("change", function () {
        info.querySelector("#line").innerHTML = route.text
        info.querySelector("#line").style = "background-color: " + route.col + ";"
        info.querySelector("#dest").innerHTML = patternCache[route.p].long_name //outOfService ? "Fora de serviço" : headsignCache[vehicles.find(a => a.id === point.id).tripId.replaceAll("|", "_").split("_").slice(0, 3).join("_").replaceAll("C", "3")] || "Carregando..."
        info.querySelector("#vec").innerHTML = "# veículo: " + rg + "|" + id
        info.querySelector("#stop").innerHTML = stops.find(a => a.id === routeSection.filter(a => a.stop)[routeSection.filter(a => a.stop).length - 1].stop).name || "Sem paragem"
        info.querySelector("#lines").innerHTML = stops.find(a => a.id === routeSection.filter(a => a.stop)[routeSection.filter(a => a.stop).length - 1].stop).lines.reduce((acc, val) => acc + "<span class=\"line\" style=\"background-color: " + (val.color || "#000000") + ";\">" + val.text + "</span>", "")
        info.querySelector("#trip").innerHTML = route.trip
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