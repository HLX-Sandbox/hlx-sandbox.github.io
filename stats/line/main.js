let metrics;
let lineInfo;
let vehicles;
let cmetVehicles;

document.body.onload = async () => {
    let line = window.location.href.split("?l=")[1]
    metrics = await fetch(API_BASE2 + "metrics/demand/by_line").then(r => r.json()).then(r => r.filter(a => a.line_id === line)[0]);
    lineInfo = await fetch(CLOUDFLARED + "lines/" + line.replaceAll("1998", "CP")).then(r => r.json());
    vehicles = await fetch(CLOUDFLARED + "vehicles/l/" + line).then(r => r.json());
    cmetVehicles = await fetch(API_BASE2 + "vehicles").then(r => r.json())
    document.getElementById("line").innerHTML = `<span class="line" style="background-color: ${lineInfo.color};">${lineInfo.id}</span>${lineInfo.long_name}`
    document.getElementById("stats-vehicles").innerHTML = `<span style="color: var(--accent-secondary);">${vehicles.length}</span><br>veículo${vehicles.length === 1 ? "" : "s"}`;
    let px = metrics.qty;
    document.getElementById("stats-px").innerHTML = `<span style="color: var(--accent-secondary);">${format(px.toString())}</span><br>passageiro${px === 1 ? "" : "s"}*`;

    let servicesDiv = document.getElementById("lines")

    let svg = document.getElementById("stats-today")

    let date = (new Date(Date.now())).toISOString().split('T')[0]
    let hm = metrics.by_day.find(a => a.day === date) || [];
    if (hm.by_hour) {

        hm = hm.by_hour
        let tooltip = document.getElementById("stats-hover")
        drawGraph(hm, svg, tooltip)

        let trips = await fetch(CLOUDFLARED + "sandbox/trip-history/" + (new Date(Date.now())).toLocaleDateString().replaceAll("/", "") + "/trips").then(r => r.text())
        trips = trips.split("\n")
        trips = trips.map(a => a.split("@"))
        trips = trips.filter(a => a[1] && a[1].startsWith(line)).reverse()

        let patternsCache = {}
        
        await Promise.all(trips.map(async trip => {
            trip[1] = trip[1].replaceAll("|", "_")
            p = trip[1].split("_").slice(0, 3).join("_")
            if (!patternsCache[p]) patternsCache[p] = fetch(CLOUDFLARED + "patterns/" + p).then(r => r.json());
            if (patternsCache[p].then) patternsCache[p] = await Promise.resolve(patternsCache[p]);
        }))
        
        trips.map(trip => {
            trip[1] = trip[1].replaceAll("|", "_")
            p = trip[1].split("_").slice(0, 3).join("_")
            
            trip[1] = trip[1].replaceAll("|", "_")
            p = trip[1].split("_").slice(0, 3).join("_")
            let div = document.createElement("div")
            div.onclick = () => window.location.href = "/trip-history/?t=" + trip[1]
            div.className = "line-usage-el"
            vi = cmetVehicles.find(a => a.id === trip[0]);
            console.log(vi)
            if(!vi) return
            div.innerHTML = `<p class="upper"><span class="line" style="background-color: ${lineInfo.color};">${p.split("_")[0].replaceAll("1998", "CP")}</span><strong>${patternsCache[p].headsign}</strong></p><p class="lower">Realizado por um <strong>${vi.make} - ${vi.model}</strong> (${trip[0]}) | TripID: ${trip[1]} </p>`
            servicesDiv.appendChild(div)
        })
        drawGraph(hm, svg, tooltip)
        
    } else {
        servicesDiv.innerHTML = "<p style=\"text-align: center\">Não houve circulações neste dia.</p>"
        svg.innerHTML = `<text x="50%" y="50%" text-anchor="middle" dominant-baseline="middle" font-size="20" fill="#5c5c5c">Não houve circulações neste dia.</text>`
    }
}

function format(str) {
    return str.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

function drawGraph(hm, svg, tooltip) {
    let w = svg.clientWidth;
    let h = svg.clientHeight;
    let maxY = Math.max(...hm.map(a => a.qty)) + 10;
    let minH = 0;
    let maxH = new Date().getHours() //Math.max(...hm.map(a => a.hour));
    let lines = "";
    let lineData = [];
    for (let i = minH; i < maxH; i++) {
        let stat = hm.find(a => a.hour === i) || { hour: i, qty: 0 }
        let stat2 = hm.find(a => a.hour === i + 1) || { hour: i + 1, qty: 0 }
        lineData.push({ x1: (i / maxH * 100).toFixed(3), y1: ((maxY - stat.qty) / (maxY) * 100).toFixed(3), x2: ((i + 1) / maxH * 100).toFixed(3), y2: ((maxY - stat2.qty) / (maxY) * 100).toFixed(3) })
        lines = lines + `<line x1="${(i / maxH * 100).toFixed(3)}%" y1="${((maxY - stat.qty) / (maxY) * 100).toFixed(3)}%" x2="${((i + 1) / maxH * 100).toFixed(3)}%" y2="${((maxY - stat2.qty) / (maxY) * 100).toFixed(3)}%" stroke="${lineInfo.color}" stroke-width="2"/>`
    }

    const polygonPoints = lineData.map(line => `${line.x1 / 100 * w},${line.y1 / 100 * h}`).join(' ') + ' ' + `${lineData[lineData.length - 1].x2 / 100 * w},${lineData[lineData.length - 1].y2 / 100 * h} ${w},${h} ${lineData[0].x1},${h}`;
    const polygon = document.createElementNS("http://www.w3.org/2000/svg", "polygon");
    polygon.setAttribute("points", polygonPoints);
    polygon.setAttribute("fill", lineInfo.color + "3F");

    svg.innerHTML = polygon.outerHTML + "\n" + lines + "\n" + `<circle cx="0%" cy="0%" r="5" fill="${lineInfo.color}" style="opacity: 0;" id="selected"></circle>`;
    let selected = document.getElementById("selected")
    svg.addEventListener("mousemove", (e) => {
        const mouseX = e.offsetX;
        let per = mouseX / w;
        tooltip.style.display = "block";
        let index = Math.round(maxH * per)
        let q = (hm.find(a => a.hour === index) || { qty: 0 }).qty;
        tooltip.innerHTML = index + " horas: " + q + " passageiros"
        selected.style.opacity = 1;
        selected.setAttribute("cx", index / maxH * 100 + "%")
        selected.setAttribute("cy", (maxY - q) / maxY * 100 + "%")
    });
    svg.addEventListener("mouseleave", () => {
        tooltip.style.display = "none"
        selected.style.opacity = 0;
    });
}