let user = document.getElementById("login");
window.getCookie = function (name) {
    var match = document.cookie.match(new RegExp('(^| )' + name + '=([^;]+)'));
    if (match) return match[2];
}

let stops = fetch(CLOUDFLARED + "stops").then(async r => await r.json()).catch(() => fetch("https://api.cmet.pt/stops").then(async r => stops = await r.json()))
let stops2 = fetch(CLOUDFLARED + "sandbox/editor/stops/").then(async r => await r.json());

let selMarker;

let userinfo;

let info = document.getElementById("stop-info");

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
                loadInfo(point)
                this._redraw()
                map.flyTo([point.lat, point.lon], 17, {
                    animate: true,
                    duration: 1.0
                })
            }
        });
    },

    onRemove: function (map) {
        L.DomUtil.remove(this._canvas);
        map.off('viewreset', this._reset, this);
        map.off('move', this._update, this);
    },

    addMarker: function (lat, lon, id, text, size) {
        if (this._data.find(a => a.id === id)) {
            this._data.find(a => a.id === id).lat = lat
            this._data.find(a => a.id === id).lon = lon
            this._data.find(a => a.id === id).text = text
            this._data.find(a => a.id === id).size = size
            return;
        }
        this._data.push({ lat, lon, id, text, size });
        return { lat, lon, id, text, size }
    },

    removeMarker: function (id) {
        if (!this._data.find(a => a.id === id)) return;
        this._data.splice(this._data.indexOf(this._data.find(a => a.id === id)), 1)
    },

    updateMarker: function (lat, lon, id, text, size) {
        if (this._data.find(a => a.id === id)) {
            this._data.find(a => a.id === id).lat = lat
            this._data.find(a => a.id === id).lon = lon
            this._data.find(a => a.id === id).text = text
            this._data.find(a => a.id === id).size = size
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
        this._data.forEach((point) => {
            if (!point.text) return;
            if (selMarker) {
                if (point.id === selMarker) {
                    alpha = 1.0;
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

                ctx.strokeStyle = "#000000" + Math.round(alpha * 255).toString(16).padStart(2, '0');
                ctx.beginPath();
                ctx.fillStyle = "#ffffff" + Math.round(alpha * 255).toString(16).padStart(2, '0');
                if(point.size) ctx.fillStyle = "#0077ff" + Math.round(alpha * 255).toString(16).padStart(2, '0');
                ctx.arc(adjustedPos.x, adjustedPos.y, 8 + point.size*5, 0, Math.PI * 2)
                ctx.fill();
                
                ctx.stroke();
                if(point.size) {
                    ctx.textAlign = 'center';
                    ctx.textBaseline = 'top';
                    ctx.font = 'bold ' + (10 + point.size*2) + 'px sans-serif';
                    ctx.fillStyle = "#000000" + Math.round(alpha * 255).toString(16).padStart(2, '0');
                    ctx.fillText(point.size, adjustedPos.x, adjustedPos.y - 5);
                }
            }
        });
    },
});

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
info.style.display = "none";

info.querySelector("#close").onclick = () => {
    info.style.display = "none";
    selMarker = null;
    customLayer._redraw()
}

function getStops() {
    return stops;
}

function loadInfo(point) {
    info.style.display = "block";
                info.querySelector("#stop").innerHTML = point.text
                info.querySelector("#lines").innerHTML = stops.find(a => a.id === point.id).lines.reduce((acc, val) => acc + "<span class=\"line\" style=\"background-color: " + (val.color || "#000000") + ";\">" + val.text + "</span>", "")
                info.querySelector("#id").innerHTML = "#" + point.id
                info.querySelector("#suggestions").innerHTML = "<p>Carregando...</p>"
                fetch(CLOUDFLARED + "sandbox/editor/stops/list/" + point.id).then(r => r.json()).then(r => {
                    let t = "";
                    point.size = r.length;
                    r.forEach(s => {
                        t = t + `<div class="suggestion" id="${point.id}-${s.si}">
                <p>${s.name}</p>
                <span><button id="upvote" onclick="upvote('${point.id}-${s.si}')" ${s.c2 && s.c2.includes(userinfo ? userinfo.id : "") ? "class=\"disabled\"" : ""}>👍</button> ${s.c} | Sugerido por ${s.user}</span>
            </div>`
                    })
                    t = t + `<button id="add" onclick="suggest('${point.id}')" ${!userinfo ? "class=\"disabled\"" : ""}>Sugerir nome</button>`;
                    info.querySelector("#suggestions").innerHTML = t;
                })
}

function postSearch(item) {
    map.setView([item.lat, item.lon], 20)
    selMarker = item.id;
    loadInfo({text: item.name, id: item.id})
    customLayer._redraw();
}

document.body.onload = async () => {
    let auth = window.getCookie("auth")
    if (!auth);
    fetch('https://discord.com/api/users/@me', {
        headers: {
            authorization: `${auth}`,
        },
    }).then(r => r.json()).then(r => {
        if(r.message) return;
        userinfo = r;
        user.setAttribute("href", "/logout")
        user.innerHTML = `<img src="https://cdn.discordapp.com/avatars/${r.id}/${r.avatar}.png" style="border: 0px; margin: 0px; vertical-align: center; border-radius: 50%; float: left; height: 1em"> ${r.global_name}`;
    })
    if(stops.then) stops = await Promise.resolve(stops)
    if(stops2.then) stops2 = await Promise.resolve(stops2);
    Object.values(stops).forEach(stop => {
        s2 = stops2[stop.id]
        if(s2) customLayer.addMarker(stop.lat, stop.lon, stop.id, stop.name, (s2 || []).length)
    })
    customLayer._redraw();
}

function upvote(marker) {
    if(!userinfo) return alert("Por favor, inicie sessão para votar.")
    let div = document.getElementById(marker)
    console.log(marker)
    if(!div) return alert("DIV not found");
    fetch(CLOUDFLARED + "sandbox/editor/stops/upvote/" + marker.replace("-","/") + "?id=" + userinfo.id).then(r => {
        if(r.status === 404) alert("Já votou nesta sugestão");
        id = marker.split("-")[0]
        fetch(CLOUDFLARED + "sandbox/editor/stops/list/" + id).then(r => r.json()).then(r => {
            let t = "";
            let stop = stops.find(a => a.id === id.toString())
            customLayer.updateMarker(stop.lat, stop.lon, stop.id, stop.name, r.length);
            r.forEach(s => {
                t = t + `<div class="suggestion" id="${id.toString()}-${s.si}">
        <p>${s.name}</p>
        <span><button id="upvote" onclick="upvote('${id.toString()}-${s.si}')" ${s.c2 && s.c2.includes(userinfo.id) ? "class=\"disabled\"" : ""}>👍</button> ${s.c} | Sugerido por ${s.user}</span>
    </div>`
            })
            t = t + `<button id="add" onclick="suggest('${id.toString()}')" ${!userinfo ? "class=\"disabled\"" : ""}>Sugerir nome</button>`;
            info.querySelector("#suggestions").innerHTML = t;
            customLayer._redraw();
        })
    })
}

function suggest(id) {
    if(!userinfo) return window.location.href = "/login";
    let name = prompt("Novo nome para esta paragem:")
    if(!name) return;
    fetch(CLOUDFLARED + "sandbox/editor/stops/suggest/" + id + "?name=" + name + "&user=" + userinfo.global_name + "&id=" + userinfo.id).then(() => {
        fetch(CLOUDFLARED + "sandbox/editor/stops/list/" + id).then(r => r.json()).then(r => {
            let t = "";
            let stop = stops.find(a => a.id === id.toString())
            customLayer.updateMarker(stop.lat, stop.lon, stop.id, stop.name, r.length);
            r.forEach(s => {
                t = t + `<div class="suggestion" id="${id.toString()}-${s.si}">
        <p>${s.name}</p>
        <span><button id="upvote" onclick="upvote('${id.toString()}-${s.si}')" ${s.c2 && s.c2.includes(userinfo.id) ? "class=\"disabled\"" : ""}>👍</button> ${s.c} | Sugerido por ${s.user}</span>
    </div>`
            })
            t = t + `<button id="add" onclick="suggest('${id.toString()}')" ${!userinfo ? "class=\"disabled\"" : ""}>Sugerir nome</button>`;
            info.querySelector("#suggestions").innerHTML = t;
            customLayer._redraw();
        })
    })
}