const API_URL = "https://ddre0pr81d.execute-api.eu-north-1.amazonaws.com/weather";

const form = document.getElementById("weatherForm");
const cityInput = document.getElementById("cityInput");
const searchBtn = document.getElementById("searchBtn");
const searchButtonText = document.getElementById("searchButtonText");
const message = document.getElementById("message");
const weatherCard = document.getElementById("weatherCard");
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

    document.getElementById("cityName").textContent =
        data.city || "Unknown City";

    document.getElementById("countryName").textContent =
        data.country || "";

    document.getElementById("temperature").textContent =
        data.temperature ?? "--";

    document.getElementById("humidity").textContent =
        data.humidity != null ? data.humidity + "%" : "--";

    document.getElementById("windSpeed").textContent =
        data.wind_speed != null ? data.wind_speed + " m/s" : "--";

    const condition = data.weather || data.description || "Unknown";

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

    weatherCard.hidden = false;
}