const API_URL = "https://sncdihnqu1.execute-api.eu-north-1.amazonaws.com/prod";

const form = document.getElementById("weatherForm");
const cityInput = document.getElementById("cityInput");
const searchBtn = document.getElementById("searchBtn");
const message = document.getElementById("message");
const weatherCard = document.getElementById("weatherCard");

form.addEventListener("submit", async function (event) {

    event.preventDefault();

    const city = cityInput.value.trim();

    if (!city) {
        message.textContent = "Please enter a city name.";
        return;
    }

    if (API_URL.includes("PASTE_YOUR")) {
        message.textContent = "Please configure your API Gateway URL first.";
        return;
    }

    searchBtn.disabled = true;
    searchBtn.textContent = "Searching...";
    message.textContent = "Fetching weather information...";
    weatherCard.hidden = true;

    try {

        const response = await fetch(
            `${API_URL.replace(/\/$/, "")}/weather?city=${encodeURIComponent(city)}`
        );

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.error || data.message || "Unable to fetch weather data.");
        }

        displayWeather(data);

        message.textContent = "Weather information loaded successfully.";

    } catch (error) {

        message.textContent = error.message;
        weatherCard.hidden = true;

    } finally {

        searchBtn.disabled = false;
        searchBtn.textContent = "Search";

    }

});


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