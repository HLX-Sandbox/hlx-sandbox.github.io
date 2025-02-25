markersCache = {}

positionCache = {};

let vehicles;

let info = document.getElementById("info")

let stats = document.getElementById("stats")

fetch(CLOUDFLARED + "stops").then(async r => stops = await r.json()).catch(() => fetch("https://api.cmet.pt/stops").then(async r => stops = await r.json()))

info.style.display = "none";

let selMarker;

//let socket = new WebSocket(CLOUDFLARED2); 

let vehicleMeta;
fetch(API_BASE + "vehicles").then(r => r.json()).then(r => vehicleMeta = r)

/*function onopen() { 
    socket.send("ping")
    setInterval(() => {
        socket.send("ping")
    }, 30*1000)     
};*/ 

function onmessage(msg) {
    if(msg.data !== "OK") {
        msg = JSON.parse(msg.data)
        if(!msg.op === 21 || !selMarker) return;
        if(!positionCache[selMarker]) positionCache[selMarker] = []
        positionCache[selMarker].push(msg.i.g)
        if (!outOfService && !headsignCache[msg.i.p]) fetch(CLOUDFLARED + "patterns/" + msg.i.p.replaceAll("|", "_").split("_").slice(0, 3).join("_").replaceAll("C", "3")).then(r => r.json()).then(s => {
            info.querySelector("#dest").innerHTML = s.headsign || "DESCONHECIDO"
            headsignCache[s.id] = s.headsign;
        })
        vehicles.find(a => a.id === selMarker).stopId = msg.i.s;
        if(vehicles.find(a => a.id === selMarker).tripId !== msg.i.t) positionCache[selMarker] = [];
        vehicles.find(a => a.id === selMarker).tripId = msg.i.t;
        customLayer._redraw()
    }
}

//socket.onopen = onopen;

let headsignCache = {};

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

        canvas.addEventListener('click', this._onClick.bind(this));

        this._reset();
    },

    _onClick: function (e) {
        if(selMarker) return;
        const buffer = 100;
        const canvasPos = this._canvas.getBoundingClientRect();
        const clickX = e.clientX - canvasPos.left + buffer;
        const clickY = e.clientY - canvasPos.top + buffer;
        const bounds = this._map.getBounds();
        const topLeft = this._map.latLngToLayerPoint(bounds.getNorthWest()).subtract([buffer, buffer]);
        let foundMarker = false;
        this._data.forEach((point) => {
            if (foundMarker) return;
            const pos = this._map.latLngToLayerPoint([point.lat, point.lon]);
            const adjustedPos = pos.subtract(topLeft).add([buffer, buffer]);
            const radius = 15;
            if (
                clickX >= adjustedPos.x - radius &&
                clickX <= adjustedPos.x + radius &&
                clickY >= adjustedPos.y - radius &&
                clickY <= adjustedPos.y + radius
            ) {
                outOfService = false;
                foundMarker = true;
                selMarker = point.id;
                if (vehicles.find(a => a.id === point.id) && !vehicles.find(a => a.id === point.id).tripId) {
                    point.text = point.id;
                    point.col = "#000000"
                    outOfService = true;
                }
                fetch(CLOUDFLARED + "t/shift/" + point.rg + "-" + point.shift + "/current").then(r => r.json()).then(async s => {
                    if(!s) return this._redraw();
                    s.data.pos = s.data.pos.slice(0, -1);
                    //s.nodes[0] = "0|" + s.nodes[0]
                    s = { nodes: s.data.pos.split("@") }
                    positionCache[point.id] = s.nodes.map(a => a.split("|").slice(0, 2)).map(b => {
                        b[0] = parseFloat(b[0])
                        b[1] = parseFloat(b[1])
                        return b;
                    });
                    console.log("ADDED " + s.nodes.length + " entries to " + point.id)
                    this._redraw()
                    if (!outOfService) fetch(CLOUDFLARED + "patterns/" + vehicles.find(a => a.id === point.id).tripId.replaceAll("|", "_").split("_").slice(0, 3).join("_").replaceAll("C", "3")).then(r => r.json()).then(s => {
                        info.querySelector("#dest").innerHTML = s.headsign || "DESCONHECIDO"
                        headsignCache[s.id] = s.headsign;
                    })
                    positionCache[point.id] = positionCache[point.id];
                    info.querySelector("#line").innerHTML = point.text
                    info.querySelector("#line").style = "background-color: " + point.col + ";"
                    info.querySelector("#dest").innerHTML = outOfService ? "Fora de serviço" : headsignCache[vehicles.find(a => a.id === point.id).tripId.replaceAll("|", "_").split("_").slice(0, 3).join("_").replaceAll("C", "3")] || "Carregando..."
                    info.querySelector("#vec").innerHTML = "# veículo: " + point.id
                    info.querySelector("#stop").innerHTML = stops.find(a => a.id === vehicles.find(a => a.id === point.id).stopId).name || "Sem paragem"
                    info.querySelector("#vec2").innerHTML = "<strong>" + (vehicleMeta.find(a => a.id === point.id) || {make: "NULL"}).make + "</strong> " + (vehicleMeta.find(a => a.id === point.id) || {model: "NULL"}).model 
                    info.querySelector("#lines").innerHTML = stops.find(a => a.id === vehicles.find(a => a.id === point.id).stopId).lines.reduce((acc, val) => acc + "<span class=\"line\" style=\"background-color: " + (val.color || "#000000") + ";\">" + val.text + "</span>", "")
                    info.querySelector("#trip").innerHTML = vehicles.find(a => a.id === point.id).tripId
                    info.style.display = "block";
                    
                    map.flyTo([point.lat, point.lon], 17, {
                        animate: true,
                        duration: 1.0
                    })
                })

                return;
            }
        });
    },

    onRemove: function (map) {
        L.DomUtil.remove(this._canvas);
        map.off('viewreset', this._reset, this);
        map.off('move', this._update, this);
    },

    addMarker: function (lat, lon, id, text, col, shift, rg) {
        if (this._data.find(a => a.id === id)) {
            this._data.find(a => a.id === id).lat = lat
            this._data.find(a => a.id === id).lon = lon
            this._data.find(a => a.id === id).text = text
            this._data.find(a => a.id === id).col = col
            this._data.find(a => a.id === id).shift = shift
            this._data.find(a => a.id === id).rg = rg
            return;
        }
        this._data.push({ lat, lon, id, text, col, shift, rg });
        return { lat, lon, id, text, col, shift, rg }
    },

    removeMarker: function (id) {
        if (!this._data.find(a => a.id === id)) return;
        this._data.splice(this._data.indexOf(this._data.find(a => a.id === id)), 1)
    },

    updateMarker: function (lat, lon, id, text, col) {
        if (this._data.find(a => a.id === id)) {
            this._data.find(a => a.id === id).lat = lat
            this._data.find(a => a.id === id).lon = lon
            this._data.find(a => a.id === id).text = text
            this._data.find(a => a.id === id).col = col
            return;
        }
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
        if (selMarker) {
            ctx.strokeStyle = this._data.find(a => a.id === selMarker).col;
            ctx.lineWidth = 10;
            ctx.lineJoin = "round";
            ctx.lineCap = "round";
            ctx.beginPath();
            positionCache[selMarker] = positionCache[selMarker];//.slice(0, 120);
            if(!positionCache[selMarker]) return selMarker = undefined;
            for (let i = 0; i < positionCache[selMarker].length - 1; i++) {
                pointA = positionCache[selMarker][i]
                pointB = positionCache[selMarker][i + 1]
                posA = map.latLngToLayerPoint(pointA.slice(0, 2));
                adjustedPosA = posA.subtract(topLeft).add([buffer, buffer]);
                posB = map.latLngToLayerPoint(pointB.slice(0, 2));
                adjustedPosB = posB.subtract(topLeft).add([buffer, buffer]);
                if((adjustedPosA.x < 0 && adjustedPosB.x < 0) || (adjustedPosA.x > ctx.width && adjustedPosB.x > ctx.width) || (adjustedPosA.y < 0 && adjustedPosB.y < 0) || (adjustedPosA.y > ctx.height && adjustedPosB.y > ctx.height)) continue;
                if(Math.abs(pointA[0] - pointB[0]) > 0.05 || Math.abs(pointA[1] - pointB[1]) > 0.05) continue;
                ctx.beginPath();
                ctx.moveTo(adjustedPosA.x, adjustedPosA.y);
                ctx.lineTo(adjustedPosB.x, adjustedPosB.y)
                
                ctx.strokeStyle = pointB[2] + Math.round(alpha * 255).toString("16").padStart(2, "0");
                ctx.stroke();
                ctx.moveTo(adjustedPosB.x, adjustedPosB.y)
            }
            ctx.stroke()
        }
        this._data.forEach((point) => {
            if (!point.text) return;
            if (selMarker) {
                if (point.id === selMarker) {
                    alpha = 1.0;
                    len = positionCache[selMarker].length - 1;
                    if(positionCache[selMarker].length === 0) return;
                    point.lat = positionCache[selMarker][len][0]
                    point.lon = positionCache[selMarker][len][1]
                    info.querySelector("#line").innerHTML = point.text
                    info.querySelector("#line").style = "background-color: " + point.col + ";"
                    info.querySelector("#dest").innerHTML = outOfService ? "Fora de serviço" : headsignCache[vehicles.find(a => a.id === point.id).tripId.replaceAll("|", "_").split("_").slice(0, 3).join("_").replaceAll("C", "3")] || "Carregando..."
                    info.querySelector("#vec").innerHTML = "# veículo: " + point.id
                    info.querySelector("#stop").innerHTML = stops.find(a => a.id === vehicles.find(a => a.id === point.id).stopId).name || "Sem paragem"
                    info.querySelector("#vec2").innerHTML = "<strong>" + (vehicleMeta.find(a => a.id === point.id) || {make: "NULL"}).make + "</strong> " + (vehicleMeta.find(a => a.id === point.id) || {model: "NULL"}).model 
                    info.querySelector("#lines").innerHTML = stops.find(a => a.id === vehicles.find(a => a.id === point.id).stopId).lines.filter(a => a.text !== point.text).reduce((acc, val) => acc + "<span class=\"line\" style=\"background-color: " + (val.color || "#000000") + ";\">" + val.text + "</span>", "")
                    info.querySelector("#trip").innerHTML = vehicles.find(a => a.id === point.id).tripId
                } else {
                    alpha = 0;
                }
            }
            const pos = map.latLngToLayerPoint([point.lat, point.lon]);
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

                ctx.fillStyle = point.col + Math.round(alpha * 255).toString(16).padStart(2, '0');
                ctx.beginPath();
                ctx.arc(adjustedPos.x - 15, adjustedPos.y + 5, 10, Math.PI / 2, Math.PI * 3 / 2)
                ctx.lineTo(adjustedPos.x + 15, adjustedPos.y - 5);
                ctx.arc(adjustedPos.x + 15, adjustedPos.y + 5, 10, Math.PI * 3 / 2, Math.PI / 2)
                ctx.lineTo(adjustedPos.x - 15, adjustedPos.y + 15);
                ctx.fill();

                ctx.fillStyle = "#ffffff" + Math.round(alpha * 255).toString(16).padStart(2, '0');
                ctx.fillText(point.text, adjustedPos.x, adjustedPos.y);


            }
        });
    },
});

//socket.onmessage = onmessage;

map = L.map("map", {
    renderer: L.canvas(),
}).setView([38.7033459, -9.1638052], 12);
customLayer = new CustomCanvasLayer().addTo(map);

L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    minZoom: 9,
    attribution: '© OpenStreetMap',
    useCache: true,
    saveToCache: true,
    useOnlyCache: false
}).addTo(map);


info.querySelector("#close").onclick = () => {
    info.style.display = "none";
    selMarker = null;
    customLayer._redraw()
    //socket.send(JSON.stringify({op: "20", d: undefined}))
}

let i = 0;
fetchVehicles()

setInterval(() => {
    fetchVehicles()
}, 30000)

info.querySelector("#view").onclick = () => selMarker ? window.location.href = "/history/?rg=" + selMarker.split("|")[0] + "&id=" + selMarker.split("|")[1] : alert("selMarker is undefined")
info.querySelector("#vehicle").onclick = () => selMarker ? window.location.href = "/vehicle/?rg=" + selMarker.split("|")[0] + "&id=" + selMarker.split("|")[1] : alert("selMarker is undefined")

function fetchVehicles() {
    fetch(CLOUDFLARED + "vehicles").then(r => r.json()).then(v => {
        v = v.filter(a => a.lat && a.timestamp * 1000 > (Date.now() - 15 * 60 * 1000))
        if (selMarker && !v.find(a => a.id === selMarker)) {
            info.style.display = "none";
            selMarker = null;
        }
        customLayer._data = []
        v.forEach(vec => {
            /*if (vec.timestamp * 1000 < (Date.now() - 15 * 60 * 1000)) {
                vec.lineId = null;
            }*/
            if (!vec.lat) return;
            //if (!vec.lineId || vec.lineId == null) return;
            if (vec.lineId === "1998") {
                vec.lineId = "CP";
            }
            marker = customLayer.addMarker(vec.lat, vec.lon, vec.id, (vec.tripId ? vec.lineId : vec.id), (vec.tripId ? vec.color : "#000000"), vec.shiftId, vec.a);
            markersCache[vec.id] = marker;
        })
        stats.querySelector("#Z1").innerHTML = "<b>" + v.filter(a => a.tripId && a.tripId.startsWith("1")).length + "</b> - Zona 1"
        stats.querySelector("#Z2").innerHTML = "<b>" + v.filter(a => a.tripId && a.tripId.startsWith("2")).length + "</b> - Zona 2"
        stats.querySelector("#Z3").innerHTML = "<b>" + v.filter(a => a.tripId && a.tripId.startsWith("3")).length + "</b> - Zona 3"
        stats.querySelector("#Z4").innerHTML = "<b>" + v.filter(a => a.tripId && a.tripId.startsWith("4")).length + "</b> - Zona 4"
        stats.querySelector("#FS").innerHTML = "<b>" + v.filter(a => !a.tripId).length + "</b> - Fora de serviço"
        stats.querySelector("#T").innerHTML = "<b>" + v.length + "</b> - Total"
        customLayer._redraw()
        vehicles = v;
    })
}