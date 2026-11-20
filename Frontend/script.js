const API_URL = "https://ddre0pr81d.execute-api.eu-north-1.amazonaws.com/weather";

const form = document.getElementById("weatherForm");
const cityInput = document.getElementById("cityInput");
const searchBtn = document.getElementById("searchBtn");
const searchButtonText = document.getElementById("searchButtonText");
const message = document.getElementById("message");
const weatherCard = document.getElementById("weatherCard");
const forecastSection = document.getElementById("forecastSection");
const cityChips = document.querySelectorAll(".city-chip");

cityChips.forEach(function (chip) {
    chip.addEventListener("click", function () {
        cityInput.value = chip.dataset.city;
        form.requestSubmit();
    });
});

form.addEventListener("submit", async function (event) {

    event.preventDefault();

    const city = cityInput.value.trim();

    if (!city) {
        setMessage("Please enter a city name.", "is-error");
        return;
    }

    if (API_URL.includes("PASTE_YOUR")) {
        setMessage("Please configure your API Gateway URL first.", "is-error");
        return;
    }

    searchBtn.disabled = true;
    searchBtn.setAttribute("aria-busy", "true");
    searchButtonText.textContent = "Searching";
    setMessage("Fetching weather information...", "is-loading");
    weatherCard.hidden = true;
    forecastSection.hidden = true;

    try {

        const response = await fetch(
            `${API_URL.replace(/\/$/, "")}?city=${encodeURIComponent(city)}`
        );

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.error || data.message || "Unable to fetch weather data.");
        }

        displayWeather(data);

        setMessage("Weather information loaded successfully.", "is-success");

    } catch (error) {

        setMessage(error.message || "Unable to fetch weather information.", "is-error");
        weatherCard.hidden = true;
        forecastSection.hidden = true;

    } finally {

        searchBtn.disabled = false;
        searchBtn.removeAttribute("aria-busy");
        searchButtonText.textContent = "Explore";

    }

});

function setMessage(text, state) {
    message.textContent = text;
    message.className = `status-message ${state}`;
}

function displayWeather(data) {

    const current = data.current;

    document.getElementById("cityName").textContent =
        current.city || "Unknown City";

    document.getElementById("countryName").textContent =
        current.country || "";

    document.getElementById("temperature").textContent =
        current.temperature ?? "--";

    document.getElementById("humidity").textContent =
        current.humidity != null ? current.humidity + "%" : "--";

    document.getElementById("windSpeed").textContent =
        current.wind_speed != null ? current.wind_speed + " m/s" : "--";

    const condition = current.weather || "Unknown";

    document.getElementById("description").textContent = condition;

    const weather = condition.toLowerCase();

    let icon = "🌤️";

    if (weather.includes("cloud")) {
        icon = "☁️";
    } else if (weather.includes("rain")) {
        icon = "🌧️";
    } else if (weather.includes("clear")) {
        icon = "☀️";
    } else if (weather.includes("thunder")) {
        icon = "⛈️";
    } else if (weather.includes("snow")) {
        icon = "❄️";
    } else if (weather.includes("mist") || weather.includes("fog")) {
        icon = "🌫️";
    }

    document.getElementById("weatherIcon").textContent = icon;

    displayForecast(data.forecast);
    weatherCard.hidden = false;
    forecastSection.hidden = false;
}

function displayForecast(forecast) {
    const forecastGrid = document.getElementById("forecastGrid");
    forecastGrid.replaceChildren();

    const temperatures = forecast.flatMap(function (day) {
        return [Number(day.tempMin), Number(day.tempMax)];
    });
    const lowestTemperature = Math.min(...temperatures);
    const highestTemperature = Math.max(...temperatures);
    const temperatureSpan = highestTemperature - lowestTemperature;

    forecast.forEach(function (day, index) {
        const minTemperature = Number(day.tempMin);
        const maxTemperature = Number(day.tempMax);
        const rangeStart = temperatureSpan
            ? ((minTemperature - lowestTemperature) / temperatureSpan) * 100
            : 0;
        const rangeWidth = temperatureSpan
            ? ((maxTemperature - minTemperature) / temperatureSpan) * 100
            : 100;

        const card = document.createElement("article");
        card.className = "forecast-card";
        card.style.setProperty("--card-index", index);

        const heading = document.createElement("div");
        heading.className = "forecast-card-heading";
        const dayName = document.createElement("h3");
        dayName.textContent = index === 0 ? "Today" : day.dayName;

        const date = document.createElement("p");
        date.className = "forecast-date";
        date.textContent = new Intl.DateTimeFormat(undefined, {
            month: "short",
            day: "numeric"
        }).format(new Date(`${day.date}T12:00:00`));
        heading.append(dayName, date);

        const icon = createForecastIcon(day, index);

        const description = document.createElement("p");
        description.className = "forecast-description";
        description.textContent = day.description;

        const temperatureRange = document.createElement("div");
        temperatureRange.className = "forecast-temperature-range";
        temperatureRange.setAttribute(
            "aria-label",
            `Low ${Math.round(minTemperature)}°C, high ${Math.round(maxTemperature)}°C`
        );

        const minTemperatureLabel = document.createElement("span");
        minTemperatureLabel.className = "forecast-temp-min";
        minTemperatureLabel.textContent = `${Math.round(minTemperature)}°`;

        const rangeTrack = document.createElement("span");
        rangeTrack.className = "forecast-range-track";
        const rangeFill = document.createElement("span");
        rangeFill.className = "forecast-range-fill";
        rangeFill.style.setProperty("--range-start", `${rangeStart}%`);
        rangeFill.style.setProperty("--range-width", `${rangeWidth}%`);
        rangeTrack.append(rangeFill);

        const maxTemperatureLabel = document.createElement("span");
        maxTemperatureLabel.className = "forecast-temp-max";
        maxTemperatureLabel.textContent = `${Math.round(maxTemperature)}°`;

        temperatureRange.append(
            minTemperatureLabel,
            rangeTrack,
            maxTemperatureLabel
        );

        const stats = document.createElement("div");
        stats.className = "forecast-stats";

        const humidity = document.createElement("div");
        humidity.className = "forecast-stat";
        humidity.setAttribute("role", "group");
        humidity.setAttribute("aria-label", "Humidity");
        humidity.append(createStatIcon("humidity"));
        const humidityValue = document.createElement("strong");
        const humidityAmount = day.humidity ?? day.main?.humidity;
        humidityValue.textContent = humidityAmount == null
            ? "--"
            : `${humidityAmount}%`;
        humidity.append(humidityValue);

        const wind = document.createElement("div");
        wind.className = "forecast-stat";
        wind.setAttribute("role", "group");
        wind.setAttribute("aria-label", "Wind speed");
        wind.append(createStatIcon("wind"));
        const windValue = document.createElement("strong");
        const windSpeed = day.windSpeed ?? day.wind_speed ?? day.wind?.speed;
        windValue.textContent = Number.isFinite(windSpeed)
            ? `${windSpeed.toFixed(1)}m/s`
            : "--";
        wind.append(windValue);
        stats.append(humidity, wind);

        card.append(heading, icon, description, temperatureRange, stats);
        if (index === 0) {
            card.classList.add("active");
        }
        forecastGrid.append(card);
    });
}

function createForecastIcon(day, index) {
    const icon = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    const description = String(day.description || "Weather condition");
    const iconCode = String(day.icon || "");
    const code = iconCode.slice(0, 2);
    const isNight = iconCode.endsWith("n");
    const gradientId = `forecast-icon-${index}`;

    icon.classList.add("forecast-icon");
    icon.setAttribute("viewBox", "0 0 80 72");
    icon.setAttribute("role", "img");
    icon.setAttribute("aria-label", description);

    const sun = isNight
        ? `<circle cx="53" cy="23" r="12" fill="url(#${gradientId}-sun)"/><circle cx="59" cy="18" r="11" fill="#16222f"/>`
        : `<g stroke="#ffcf58" stroke-linecap="round" stroke-width="3"><path d="M53 3v5M53 39v5M33 23h5M69 23h5M39 9l4 4M64 34l4 4M67 9l-4 4M42 34l-4 4"/></g><circle cx="53" cy="23" r="12" fill="url(#${gradientId}-sun)"/><path d="M46 20c2-5 8-7 12-4" fill="none" stroke="#fff4b8" stroke-linecap="round" stroke-width="2"/>`;
    const cloud = `<path d="M16 50h43a11 11 0 0 0 1-22 17 17 0 0 0-33-2 12 12 0 0 0-11 24Z" fill="url(#${gradientId}-cloud)" stroke="#dbe8f3" stroke-opacity=".72" stroke-width="1.5"/><path d="M25 34c4-8 12-11 20-9" fill="none" stroke="#fff" stroke-linecap="round" stroke-opacity=".62" stroke-width="2"/>`;
    const layeredCloud = `<path d="M5 51h29a8 8 0 0 0 0-16 12 12 0 0 0-23-1 8 8 0 0 0-6 17Z" fill="url(#${gradientId}-cloud)" stroke="#dbe8f3" stroke-opacity=".5" stroke-width="1"/>`;
    const rain = `<g fill="url(#${gradientId}-rain)"><path d="M27 53c0-3 4-8 4-8s4 5 4 8a4 4 0 1 1-8 0Z"/><path d="M42 59c0-3 4-8 4-8s4 5 4 8a4 4 0 1 1-8 0Z"/><path d="M56 53c0-3 4-8 4-8s4 5 4 8a4 4 0 1 1-8 0Z"/></g>`;

    let weatherArt;
    if (code === "01") {
        weatherArt = sun;
    } else if (code === "02") {
        weatherArt = `${sun}${layeredCloud}${cloud}`;
    } else if (code === "09" || code === "10") {
        weatherArt = `${cloud}${rain}`;
    } else if (code === "11") {
        weatherArt = `${cloud}<path d="m43 45-9 13h8l-3 12 13-17h-9l5-8Z" fill="#ffd45c" stroke="#fff0a8" stroke-linejoin="round" stroke-width="1.5"/>`;
    } else if (code === "13") {
        weatherArt = `${cloud}<g fill="#91d9ff" stroke="#e1f7ff" stroke-width="1"><path d="M29 53v10m-4-7 8 4m0-4-8 4"/><path d="M49 54v10m-4-7 8 4m0-4-8 4"/></g>`;
    } else if (code === "50") {
        weatherArt = `${cloud}<g fill="none" stroke="#b6d2e3" stroke-linecap="round" stroke-width="2.5"><path d="M15 56h18m5 0h27M20 63h22m5 0h14"/></g>`;
    } else {
        weatherArt = cloud;
    }

    icon.innerHTML = `<defs><radialGradient id="${gradientId}-sun"><stop stop-color="#fff5ac"/><stop offset="1" stop-color="#ffad2f"/></radialGradient><linearGradient id="${gradientId}-cloud" x1="20" y1="24" x2="53" y2="53" gradientUnits="userSpaceOnUse"><stop stop-color="#fff"/><stop offset="1" stop-color="#a8bdce"/></linearGradient><linearGradient id="${gradientId}-rain" x1="31" y1="45" x2="59" y2="62" gradientUnits="userSpaceOnUse"><stop stop-color="#83ddff"/><stop offset="1" stop-color="#2996ed"/></linearGradient></defs>${weatherArt}`;
    return icon;
}

function createStatIcon(type) {
    const icon = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    icon.setAttribute("viewBox", "0 0 24 24");
    icon.setAttribute("aria-hidden", "true");

    icon.innerHTML = type === "humidity"
        ? '<path d="M12 2.8S6.2 9.2 6.2 13.7a5.8 5.8 0 0 0 11.6 0C17.8 9.2 12 2.8 12 2.8Z" fill="#65bfff" stroke="#a9e3ff" stroke-width="1.2"/><path d="M9.2 14.6a2.8 2.8 0 0 0 2.8 2.8" fill="none" stroke="#e5f8ff" stroke-linecap="round" stroke-width="1.5"/>'
        : '<path d="M3 8h11.5a3 3 0 1 0-2.8-4" fill="none" stroke="#70e6be" stroke-linecap="round" stroke-width="2"/><path d="M2 12h16a3 3 0 1 1-2.8 4" fill="none" stroke="#70e6be" stroke-linecap="round" stroke-width="2"/><path d="M4 16h6" fill="none" stroke="#b5f7df" stroke-linecap="round" stroke-width="2"/>';
    return icon;
}
