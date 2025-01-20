const el = document.getElementById("search")
const autocoplete = document.getElementById('autocomplete');

el.addEventListener("focusin", () => {
    genAutocomplete()
});

el.addEventListener('input', function() {
    genAutocomplete()
});

let caches = {}

function filter(text) {
    if(!text) return ""
    return text.replaceAll("av ","avenida ").replaceAll("r ","rua ").replaceAll("(x)","").replaceAll("(","").replaceAll(")","").replaceAll("entrada","").replaceAll("ú","u").replaceAll("á","a").replaceAll("é","e").replaceAll("ó","o").replaceAll("à","a").replaceAll("ã","a")
}

function getDateInUTC4() {
    let n = new Date();
    
    const utcMillis = n.getTime() + n.getTimezoneOffset() * 60000;
    
    const utcMinus4 = new Date(utcMillis - 4 * 60 * 60000);
    const day = String(utcMinus4.getDate()).padStart(2, "0");
    const month = String(utcMinus4.getMonth() + 1).padStart(2, "0");
    const year = utcMinus4.getFullYear();

    return `${day}${month}${year}`;
}

let vehicles = fetch(CLOUDFLARED + "vehicles").then(r => r.json());
let shifts = fetch(CLOUDFLARED  + "t/vehicles/" + getDateInUTC4() + "/").then(r => r.text());
let trips = fetch(CLOUDFLARED + "t/tripIds/" + getDateInUTC4() + "/").then(r => r.text());

async function genAutocomplete() {
    if(vehicles.then) vehicles = await Promise.resolve(vehicles);
    if(shifts.then) shifts = (await Promise.resolve(shifts)).split("\n");
    if(trips.then) trips = (await Promise.resolve(trips)).split("\n");
    const query = el.value.toLowerCase();
    autocomplete.innerHTML = ''; // Clear previous suggestions

    if (query.length > 0) {
        autocoplete.classList.remove("hidden")
        let filteredSuggestions;
        if(query.startsWith("41|") || query.startsWith("42|") || query.startsWith("43|") || query.startsWith("44|")) {
            filteredSuggestions = vehicles.filter(a => {
                return a.id.startsWith(query)
            }).map(a => ({
                ...a,
                text: a.id + " | Chapa: "  + (a.shiftId || "N/A") + " | Linha: " + (a.lineId || "N/A"),
                desc: a.tripId || "Fora de Serviço",
                val: "Veiculo: " + a.id
            }))
        } else if(query.length > 6) {
            console.log(trips)
            filteredSuggestions = trips.filter(a => {
                return a.split(">")[0].startsWith(query)
            }).map(a => ({
                ...a,
                text: a.split(">")[0],
                desc: "Chapa: " + a.split(">")[1],
                val: "Trip: " + a.split(">")[0],
                id: a.split(">")[0]
            }))
        } else {
            filteredSuggestions = [];
        }
        
        filteredSuggestions.sort((a, b) => {
            return a.id.localeCompare(b.id);
        })
        let b = true;
        filteredSuggestions = filteredSuggestions.slice(0, 100)
        filteredSuggestions.forEach(item => {
            b = !b
            const suggestionItem = document.createElement('div');
            const lines = document.createElement('div');
            lines.classList.add("lines")
            lines.innerHTML = (item.desc)
            if(b) suggestionItem.classList.add("a") 
            suggestionItem.textContent = item.text;
            suggestionItem.addEventListener('click', () => {
                el.value = item.val; 
                autocomplete.innerHTML = '';
            });
            suggestionItem.appendChild(lines)
            autocomplete.appendChild(suggestionItem);
        });
    } else {
        autocoplete.classList.add("hidden")
    }
}