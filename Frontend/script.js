const API_URL = "https://5lkuvijns9.execute-api.eu-north-1.amazonaws.com/weather";
const DEFAULT_CITY = "Kolkata";
const SVG_NS = "http://www.w3.org/2000/svg";

const form = document.getElementById("weatherForm");
const cityInput = document.getElementById("cityInput");
const searchBtn = document.getElementById("searchBtn");
const message = document.getElementById("message");
const forecastList = document.getElementById("forecastList");
const forecastRangeButtons = document.querySelectorAll("[data-days]");
const summaryTabButtons = document.querySelectorAll("[data-summary]");
const popularCityButtons = document.querySelectorAll(".popular-city");
const locationBtn = document.getElementById("centerMapBtn");
const CITY_COORDINATES = {
    "kolkata": [22.5726, 88.3639],
    "delhi": [28.6139, 77.2090],
    "mumbai": [19.0760, 72.8777],
    "hyderabad": [17.3850, 78.4867],
    "bangalore": [12.9716, 77.5946],
    "bengaluru": [12.9716, 77.5946],
    "london": [51.5072, -0.1276],
    "new york": [40.7128, -74.0060],
    "tokyo": [35.6762, 139.6503],
    "toronto": [43.6532, -79.3832],
    "los angeles": [34.0522, -118.2437],
    "san francisco": [37.7749, -122.4194],
    "paris": [48.8566, 2.3522],
    "singapore": [1.3521, 103.8198],
    "sydney": [-33.8688, 151.2093],
    "dubai": [25.2048, 55.2708],
    "beijing": [39.9042, 116.4074],
    "dhaka": [23.8103, 90.4125],
    "chennai": [13.0827, 80.2707],
    "pune": [18.5204, 73.8567],
    "rome": [41.9028, 12.4964],
    "berlin": [52.5200, 13.4050],
    "madrid": [40.4168, -3.7038],
    "amsterdam": [52.3676, 4.9041],
    "seoul": [37.5665, 126.9780],
    "bangkok": [13.7563, 100.5018]
};

let latestWeatherData = null;
let forecastLimit = 7;
let selectedForecastIndex = 0;
let weatherMap = null;
let mapMarker = null;
let weatherIconSequence = 0;
let chartResizeFrame = null;
let weatherRequestSequence = 0;
let mapResolvedRequestId = 0;
let activeMapLocation = null;
let activeWeatherCurrent = null;
let lastGeocodingRequest = 0;
let mapClickTimer = null;
let mapClickPlace = null;
let geocodingQueue = Promise.resolve();
const geocodeCache = new Map();

form.addEventListener("submit", function (event) {
    event.preventDefault();
    const city = cityInput.value.trim();

    if (!city) {
        setMessage("Enter a location to search.", "is-error");
        cityInput.focus();
        return;
    }

    fetchWeather({ city: city });
});

document.getElementById("viewMoreCities").addEventListener("click", function () {
    cityInput.focus();
});

popularCityButtons.forEach(function (button) {
    button.addEventListener("click", function () {
        const city = button.dataset.city;
        cityInput.value = city;
        fetchWeather({ city: city });
    });
});

forecastRangeButtons.forEach(function (button) {
    button.addEventListener("click", function () {
        forecastLimit = Number(button.dataset.days);
        forecastRangeButtons.forEach(function (rangeButton) {
            const active = rangeButton === button;
            rangeButton.classList.toggle("is-active", active);
            rangeButton.setAttribute("aria-pressed", String(active));
        });
        if (latestWeatherData) {
            const current = normalizeCurrentWeather(latestWeatherData);
            renderForecast(getDailyForecast(
                latestWeatherData,
                getHourlySource(latestWeatherData),
                Number(current.timezone) || 0
            ));
        }
    });
});

summaryTabButtons.forEach(function (button) {
    button.addEventListener("click", function () {
        summaryTabButtons.forEach(function (tab) {
            const active = tab === button;
            tab.classList.toggle("is-active", active);
            tab.setAttribute("aria-selected", String(active));
        });
        if (latestWeatherData) {
            renderSummaryMode(button.dataset.summary);
        } else {
            updateSummaryDate(button.dataset.summary);
        }
    });
});

document.getElementById("zoomInBtn").addEventListener("click", function () {
    if (weatherMap) {
        weatherMap.zoomIn();
    }
});

document.getElementById("zoomOutBtn").addEventListener("click", function () {
    if (weatherMap) {
        weatherMap.zoomOut();
    }
});

locationBtn.addEventListener("click", requestCurrentLocation);

window.addEventListener("resize", function () {
    const activeMode = document.querySelector("[data-summary].is-active")?.dataset.summary;
    if (!latestWeatherData || activeMode === "More Details" || chartResizeFrame !== null) {
        return;
    }
    chartResizeFrame = window.requestAnimationFrame(function () {
        chartResizeFrame = null;
        renderSummaryMode(activeMode);
    });
});

function setMessage(text, state) {
    message.textContent = text;
    message.className = `status-message${state ? ` ${state}` : ""}`;
}

function setLoading(isLoading, statusText) {
    searchBtn.disabled = isLoading;
    searchBtn.setAttribute("aria-busy", String(isLoading));
    popularCityButtons.forEach(function (button) {
        button.disabled = isLoading;
    });
    if (statusText) {
        setMessage(statusText, "is-loading");
    }
}

async function fetchWeather(query) {
    const requestId = ++weatherRequestSequence;
    mapClickPlace = null;
    const searchedCity = query.city || query.cityLabel || "";
    const params = new URLSearchParams();
    if (query.city) {
        params.set("city", query.city);
    } else {
        params.set("lat", String(query.latitude));
        params.set("lon", String(query.longitude));
    }

    if (query.city) {
        focusCityOnMap(query.city, requestId);
    } else {
        moveMapTo(
            Number(query.latitude),
            Number(query.longitude),
            query.cityLabel || "Selected location",
            11,
            requestId,
            true
        );
    }

    setLoading(true, query.city
        ? `Loading weather for ${query.city}...`
        : "Loading weather for your location...");

    try {
        const response = await fetch(
            `${API_URL.replace(/\/$/, "")}?${params.toString()}`
        );
        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.error || data.message || "Unable to fetch weather data.");
        }

        if (requestId !== weatherRequestSequence) {
            return;
        }

        latestWeatherData = data;
        displayWeather(data, requestId, searchedCity, query);
        setMessage("", "");
    } catch (error) {
        if (requestId === weatherRequestSequence) {
            setMessage(error.message || "Unable to fetch weather information.", "is-error");
        }
    } finally {
        if (requestId === weatherRequestSequence) {
            setLoading(false);
        }
    }
}

function displayWeather(data, requestId, searchedCity, query) {
    const current = normalizeCurrentWeather(data);
    const condition = current.weather || "Weather conditions";
    const timezone = Number(current.timezone) || 0;
    const cityName = current.city || searchedCity || "Current Location";
    const country = current.country ? `, ${current.country}` : "";
    const fullLocation = `${cityName}${country}`;
    activeWeatherCurrent = current;
    const rawHourly = getHourlySource(data);
    const forecast = getDailyForecast(data, rawHourly, timezone);
    const intervals = buildForecastIntervals(
        rawHourly.map(normalizeHourlyEntry).filter(function (hour) {
            return Number.isFinite(hour.temperature);
        }),
        current,
        forecast
    );

    document.getElementById("temperature").textContent =
        formatTemperature(current.temperature);
    document.getElementById("currentLocation").textContent = fullLocation;
    document.getElementById("description").textContent = toTitleCase(condition);
    updateDisplayedLocalTime();
    document.getElementById("visibility").textContent =
        `${resolveVisibilityKm(current)} km`;
    document.getElementById("humidity").textContent =
        current.humidity == null ? "--%" : `${current.humidity}%`;
    document.getElementById("windSpeed").textContent =
        formatWind(current.wind_speed);
    document.getElementById("pressure").textContent =
        current.pressure == null ? "1013 hPa" : `${current.pressure} hPa`;

    const weatherIcon = createWeatherIcon(condition, current.icon);
    weatherIcon.classList.add("current-icon-art");
    document.getElementById("weatherIcon").replaceChildren(weatherIcon);

    updateMap(current, fullLocation, requestId, searchedCity, query);
    if (mapClickPlace?.requestId === requestId && mapClickPlace.name) {
        applyMapClickPlace(mapClickPlace.name, mapClickPlace, requestId);
    }
    updatePopularCondition(cityName, condition);
    renderForecast(forecast);
    renderSummaryMode(
        document.querySelector("[data-summary].is-active")?.dataset.summary || "Summary",
        { current: current, forecast: forecast, intervals: intervals }
    );
}

function normalizeCurrentWeather(data) {
    const current = data.current || data;
    const weatherEntry = Array.isArray(current.weather)
        ? current.weather[0] || {}
        : {};
    const cloudCover = current.clouds?.all ?? current.clouds;
    return {
        ...current,
        city: current.city || current.name,
        country: current.country || current.sys?.country,
        temperature: current.temperature ?? current.main?.temp ?? current.temp,
        feels_like: current.feels_like ?? current.feelsLike ?? current.main?.feels_like,
        humidity: current.humidity ?? current.main?.humidity,
        clouds: cloudCover == null ? null : Number(cloudCover),
        condition: current.condition || weatherEntry.main || current.weatherMain,
        weather: typeof current.weather === "string"
            ? current.weather
            : weatherEntry.description || current.description,
        icon: current.icon || weatherEntry.icon,
        wind_speed: current.wind_speed ?? current.windSpeed ?? current.wind?.speed,
        visibility: current.visibility,
        pressure: current.pressure ?? current.main?.pressure,
        sunrise: current.sunrise ?? current.sys?.sunrise,
        sunset: current.sunset ?? current.sys?.sunset,
        timezone: current.timezone ?? data.timezone,
        dt: current.dt ?? data.dt,
        latitude: current.latitude ?? current.lat ?? current.coord?.lat,
        longitude: current.longitude ?? current.lon ?? current.coord?.lon
    };
}

function getHourlySource(data) {
    const candidates = [
        data.hourly,
        data.list,
        data.forecast?.list,
        data.forecast?.hourly,
        data.hourlyForecast
    ];
    const directForecast = Array.isArray(data.forecast)
        && data.forecast.some(function (entry) {
            return entry.main?.temp != null || (
                entry.temp != null && entry.tempMin == null && entry.tempMax == null
            );
        })
        ? data.forecast
        : null;
    candidates.push(directForecast);
    return candidates.find(function (candidate) {
        return Array.isArray(candidate) && candidate.length > 0;
    }) || candidates.find(Array.isArray) || [];
}

function normalizeHourlyEntry(hour) {
    const timestamp = hour.dt == null ? NaN : Number(hour.dt);
    const temperature = hour.temp ?? hour.main?.temp ?? hour.temperature;
    const weather = Array.isArray(hour.weather) ? hour.weather[0] || {} : {};
    const cloudCover = hour.clouds?.all ?? hour.clouds;
    return {
        temperature: temperature == null ? NaN : Number(temperature),
        probability: normalizeProbability(
            hour.pop ?? hour.precipitation_probability ?? hour.rain_probability
        ),
        humidity: hour.humidity ?? hour.main?.humidity,
        clouds: cloudCover == null ? null : Number(cloudCover),
        condition: hour.condition || weather.main || hour.weatherMain,
        windSpeed: toWindSpeed(
            hour.wind_speed ?? hour.windSpeed ?? hour.wind?.speed
        ),
        timestamp: Number.isFinite(timestamp)
            ? timestamp
            : parseForecastTimestamp(hour.dt_txt),
        icon: hour.icon || weather.icon || "",
        description: hour.description || weather.description || ""
    };
}

function getDailyForecast(data, rawHourly, timezone) {
    const forecastArray = Array.isArray(data.forecast) ? data.forecast : null;
    const forecastIsDaily = forecastArray && forecastArray.some(function (entry) {
        return entry.tempMin != null
            || entry.tempMax != null
            || entry.temp_min != null
            || entry.temp_max != null
            || entry.temp?.min != null
            || entry.temp?.max != null;
    });
    const candidates = [
        forecastIsDaily ? forecastArray : null,
        Array.isArray(data.daily) ? data.daily : null,
        Array.isArray(data.forecast?.daily) ? data.forecast.daily : null
    ];
    const daily = candidates.find(Array.isArray);
    if (daily) {
        return daily.map(function (entry) {
            return normalizeDailyEntry(entry, timezone);
        });
    }

    if (!rawHourly.length) {
        return [];
    }

    const grouped = new Map();
    rawHourly.forEach(function (entry) {
        const normalized = normalizeHourlyEntry(entry);
        if (!Number.isFinite(normalized.temperature) || normalized.timestamp == null) {
            return;
        }
        const date = getLocalDate(normalized.timestamp, timezone)
            .toISOString()
            .slice(0, 10);
        if (!grouped.has(date)) {
            grouped.set(date, []);
        }
        grouped.get(date).push({ entry: entry, normalized: normalized });
    });

    return Array.from(grouped.entries()).map(function (item) {
        const date = item[0];
        const entries = item[1];
        const temperatures = entries.map(function (sample) {
            return sample.normalized.temperature;
        });
        const midday = entries.find(function (sample) {
            return getLocalDate(sample.normalized.timestamp, timezone).getUTCHours() === 12;
        }) || entries[Math.floor(entries.length / 2)];
        return normalizeDailyEntry({
            date: date,
            dayName: formatWeekday(date),
            tempMin: Math.min(...temperatures),
            tempMax: Math.max(...temperatures),
            description: midday.normalized.description,
            icon: midday.normalized.icon,
            pop: Math.max(...entries.map(function (sample) {
                return sample.normalized.probability ?? 0;
            })) / 100
        });
    });
}

function normalizeDailyEntry(day, timezone) {
    const weather = Array.isArray(day.weather) ? day.weather[0] || {} : {};
    const cloudCover = day.clouds?.all ?? day.clouds;
    const date = day.date
        || day.dt_txt?.slice(0, 10)
        || (day.dt == null
            ? undefined
            : getLocalDate(Number(day.dt), timezone).toISOString().slice(0, 10));
    return {
        ...day,
        date: date,
        dayName: day.dayName || day.day_name || (date ? formatWeekday(date) : undefined),
        tempMax: day.tempMax ?? day.temp_max ?? day.temp?.max ?? day.main?.temp_max,
        tempMin: day.tempMin ?? day.temp_min ?? day.temp?.min ?? day.main?.temp_min,
        description: day.description || weather.description || "",
        condition: day.condition || weather.main || day.weatherMain,
        humidity: day.humidity ?? day.main?.humidity,
        clouds: cloudCover == null ? null : Number(cloudCover),
        icon: day.icon || weather.icon || "",
        pop: day.pop ?? day.precipitation_probability
    };
}

function parseForecastTimestamp(value) {
    if (typeof value !== "string") {
        return null;
    }
    const timestamp = Date.parse(value.includes("T") ? value : `${value.replace(" ", "T")}Z`);
    return Number.isFinite(timestamp) ? timestamp / 1000 : null;
}

function normalizeProbability(probability) {
    if (probability == null || !Number.isFinite(Number(probability))) {
        return null;
    }
    const value = Number(probability);
    return Math.round(Math.min(100, Math.max(0, value <= 1 ? value * 100 : value)));
}

function toWindSpeed(metersPerSecond) {
    const speed = Number(metersPerSecond);
    return metersPerSecond == null || !Number.isFinite(speed)
        ? null
        : speed * 3.6;
}

function requestCurrentLocation() {
    if (!navigator.geolocation) {
        flyToActiveMapLocation();
        setMessage("Location is not supported by this browser.", "is-error");
        return;
    }

    const requestId = ++weatherRequestSequence;
    setLoading(true, "Finding your location...");
    navigator.geolocation.getCurrentPosition(
        function (position) {
            if (requestId !== weatherRequestSequence) {
                return;
            }
            fetchWeather({
                latitude: position.coords.latitude,
                longitude: position.coords.longitude,
                cityLabel: "Current location"
            });
        },
        function (error) {
            if (requestId !== weatherRequestSequence) {
                return;
            }
            setLoading(false);
            flyToActiveMapLocation();
            setMessage(
                error.code === error.PERMISSION_DENIED
                    ? "Location permission was denied."
                    : "Unable to determine your location. Please try again.",
                "is-error"
            );
        },
        { enableHighAccuracy: false, timeout: 10000, maximumAge: 300000 }
    );
}

function initializeMap() {
    if (!window.L) {
        document.getElementById("mapUnavailable").hidden = false;
        document.getElementById("mapUnavailable").textContent =
            "Map could not be loaded. Check your connection and reload.";
        return;
    }

    weatherMap = L.map("weatherMap", {
        zoomControl: false,
        dragging: true,
        scrollWheelZoom: true,
        doubleClickZoom: true,
        touchZoom: true,
        attributionControl: false
    }).setView([22.5726, 88.3639], 10);

    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: "&copy; OpenStreetMap contributors",
        maxZoom: 19
    }).addTo(weatherMap);

    document.getElementById("mapUnavailable").hidden = true;
    moveMapTo(22.5726, 88.3639, DEFAULT_CITY, 10, null, false);
    weatherMap.on("click", function (event) {
        if (mapClickTimer !== null) {
            window.clearTimeout(mapClickTimer);
        }
        mapClickTimer = window.setTimeout(function () {
            mapClickTimer = null;
            exploreMapLocation(event);
        }, 250);
    });
    weatherMap.on("dblclick", function () {
        if (mapClickTimer !== null) {
            window.clearTimeout(mapClickTimer);
            mapClickTimer = null;
        }
    });
    window.setTimeout(function () {
        weatherMap.invalidateSize();
    }, 100);
}

function updateMap(current, locationName, requestId, searchedCity, query) {
    const rawLatitude = current.latitude ?? current.lat;
    const rawLongitude = current.longitude ?? current.lon;
    const latitude = rawLatitude == null || rawLatitude === ""
        ? NaN
        : Number(rawLatitude);
    const longitude = rawLongitude == null || rawLongitude === ""
        ? NaN
        : Number(rawLongitude);
    if (isValidCoordinates(latitude, longitude)) {
        moveMapTo(latitude, longitude, locationName, 11, requestId, true);
        return;
    }

    const requestedLatitude = Number(query?.latitude);
    const requestedLongitude = Number(query?.longitude);
    if (isValidCoordinates(requestedLatitude, requestedLongitude)) {
        moveMapTo(
            requestedLatitude,
            requestedLongitude,
            locationName,
            11,
            requestId,
            true
        );
        return;
    }

    const hasSpecificSearch = searchedCity
        && !/^(current location|selected map location)$/i.test(searchedCity);
    focusCityOnMap(
        hasSpecificSearch ? searchedCity : current.city || searchedCity || locationName,
        requestId
    );
}

function isValidCoordinates(latitude, longitude) {
    return Number.isFinite(latitude)
        && Number.isFinite(longitude)
        && Math.abs(latitude) <= 90
        && Math.abs(longitude) <= 180;
}

function moveMapTo(latitude, longitude, locationName, zoom, requestId, animate) {
    if (!isValidCoordinates(latitude, longitude)) {
        return false;
    }

    activeMapLocation = {
        latitude: latitude,
        longitude: longitude,
        name: locationName || "Selected location"
    };
    if (requestId != null) {
        mapResolvedRequestId = requestId;
    }
    if (!weatherMap) {
        return true;
    }

    document.getElementById("mapUnavailable").hidden = true;
    const icon = L.divIcon({
        className: "weather-map-marker",
        html: `<span class="map-pin-dot"></span><span class="map-pin-label">${escapeHtml(activeMapLocation.name)}</span>`,
        iconSize: [180, 34],
        iconAnchor: [8, 30]
    });

    if (mapMarker) {
        mapMarker.setLatLng([latitude, longitude]);
        mapMarker.setIcon(icon);
    } else {
        mapMarker = L.marker([latitude, longitude], { icon: icon }).addTo(weatherMap);
    }

    if (animate) {
        weatherMap.flyTo([latitude, longitude], zoom || 11, {
            animate: true,
            duration: 1.2
        });
    } else {
        weatherMap.setView([latitude, longitude], zoom || 10);
    }
    return true;
}

function flyToActiveMapLocation() {
    if (!activeMapLocation) {
        return;
    }
    moveMapTo(
        activeMapLocation.latitude,
        activeMapLocation.longitude,
        activeMapLocation.name,
        11,
        null,
        true
    );
}

function focusCityOnMap(city, requestId) {
    const place = String(city || "").trim();
    const builtIn = getBuiltInCityCoordinates(place);
    if (builtIn) {
        moveMapTo(builtIn.latitude, builtIn.longitude, place, 11, requestId, true);
        return;
    }
    if (!place) {
        return;
    }

    resolveCityCoordinates(place).then(function (coordinates) {
        if (requestId === weatherRequestSequence) {
            moveMapTo(
                coordinates.latitude,
                coordinates.longitude,
                place,
                11,
                requestId,
                true
            );
        }
    }).catch(function (error) {
        if (
            requestId === weatherRequestSequence
            && mapResolvedRequestId !== requestId
        ) {
            setMessage(
                `Unable to locate ${place} on the map: ${getGeocodingErrorMessage(error)}`,
                "is-error"
            );
        }
    });
}

function getBuiltInCityCoordinates(place) {
    const city = String(place || "").split(",")[0].trim().toLowerCase();
    const coordinates = CITY_COORDINATES[city];
    if (!coordinates) {
        return null;
    }
    return {
        latitude: coordinates[0],
        longitude: coordinates[1]
    };
}

function resolveCityCoordinates(place) {
    const builtIn = getBuiltInCityCoordinates(place);
    if (builtIn) {
        return Promise.resolve(builtIn);
    }

    const key = String(place).trim().toLowerCase();
    if (geocodeCache.has(key)) {
        return geocodeCache.get(key);
    }

    const params = new URLSearchParams({
        format: "json",
        q: place,
        limit: "1"
    });
    const request = fetchNominatim(
        `https://nominatim.openstreetmap.org/search?${params.toString()}`
    ).then(function (results) {
        const result = Array.isArray(results) ? results[0] : null;
        const latitude = Number(result?.lat);
        const longitude = Number(result?.lon);
        if (!result || !isValidCoordinates(latitude, longitude)) {
            throw new Error(`No coordinates found for "${place}".`);
        }
        return {
            latitude: latitude,
            longitude: longitude,
            name: result.name || place
        };
    });
    const cachedRequest = request.then(
        function (coordinates) {
            return coordinates;
        },
        function (error) {
            geocodeCache.delete(key);
            throw error;
        }
    );
    geocodeCache.set(key, cachedRequest);
    return cachedRequest;
}

function reverseGeocode(latitude, longitude) {
    const params = new URLSearchParams({
        format: "json",
        lat: String(latitude),
        lon: String(longitude),
        addressdetails: "1"
    });
    return fetchNominatim(
        `https://nominatim.openstreetmap.org/reverse?${params.toString()}`
    ).then(function (result) {
        const address = result.address || {};
        const place = address.city
            || address.town
            || address.village
            || address.municipality
            || address.suburb
            || address.county
            || result.name
            || result.display_name?.split(",")[0];
        if (!place) {
            throw new Error("No place name was returned for the selected map point.");
        }
        const countryCode = address.country_code
            ? address.country_code.toUpperCase()
            : "";
        return countryCode ? `${place}, ${countryCode}` : place;
    });
}

function fetchNominatim(url) {
    const request = geocodingQueue.then(async function () {
        const wait = Math.max(0, 1000 - (Date.now() - lastGeocodingRequest));
        if (wait > 0) {
            await new Promise(function (resolve) {
                window.setTimeout(resolve, wait);
            });
        }
        lastGeocodingRequest = Date.now();
        const controller = new AbortController();
        const timeoutId = window.setTimeout(function () {
            controller.abort();
        }, 8000);
        try {
            const response = await fetch(url, {
                headers: { Accept: "application/json" },
                signal: controller.signal
            });
            if (!response.ok) {
                throw new Error(`Geocoding service returned HTTP ${response.status}.`);
            }
            return await response.json();
        } finally {
            window.clearTimeout(timeoutId);
        }
    });
    geocodingQueue = request.then(
        function () {},
        function () {}
    );
    return request;
}

function getGeocodingErrorMessage(error) {
    if (error?.name === "AbortError" || error?.name === "TimeoutError") {
        return "The geocoding request timed out.";
    }
    return error?.message || "The geocoding request failed.";
}

function exploreMapLocation(event) {
    const latitude = event.latlng.lat;
    const longitude = event.latlng.lng;
    fetchWeather({
        latitude: latitude,
        longitude: longitude,
        cityLabel: "Selected map location"
    });
    const requestId = weatherRequestSequence;
    mapClickPlace = {
        requestId: requestId,
        latitude: latitude,
        longitude: longitude,
        name: null
    };

    reverseGeocode(latitude, longitude).then(function (place) {
        if (requestId !== weatherRequestSequence) {
            return;
        }
        mapClickPlace.name = place;
        if (!cityInput.value.trim()) {
            cityInput.value = place;
        }
        applyMapClickPlace(place, mapClickPlace, requestId);
    }).catch(function (error) {
        if (requestId === weatherRequestSequence) {
            setMessage(
                `Could not resolve the selected map location: ${getGeocodingErrorMessage(error)}`,
                "is-error"
            );
        }
    });
}

function applyMapClickPlace(place, coordinates, requestId) {
    if (requestId !== weatherRequestSequence) {
        return;
    }
    document.getElementById("currentLocation").textContent = place;
    if (activeWeatherCurrent) {
        const nameParts = place.split(",");
        activeWeatherCurrent.city = nameParts[0].trim();
        activeWeatherCurrent.country = nameParts[1]?.trim() || "";
    }
    moveMapTo(
        coordinates.latitude,
        coordinates.longitude,
        place,
        11,
        requestId,
        true
    );
}

function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, function (character) {
        const entities = {
            "&": "&amp;",
            "<": "&lt;",
            ">": "&gt;",
            '"': "&quot;",
            "'": "&#39;"
        };
        return entities[character];
    });
}

function updatePopularCondition(city, condition) {
    popularCityButtons.forEach(function (button) {
        if (button.dataset.city.toLowerCase() === String(city).toLowerCase()) {
            button.querySelector(".popular-condition").textContent = toTitleCase(condition);
        }
    });
}

function formatTemperature(value) {
    const temperature = Number(value);
    return value == null || !Number.isFinite(temperature)
        ? "--"
        : String(Math.round(temperature));
}

function formatWind(metersPerSecond) {
    const speed = Number(metersPerSecond);
    return metersPerSecond == null || !Number.isFinite(speed)
        ? "-- km/h"
        : `${Math.round(speed * 3.6)} km/h`;
}

function resolveVisibilityKm(current) {
    const visibilityMeters = Number(current.visibility);
    if (
        current.visibility != null
        && current.visibility !== ""
        && Number.isFinite(visibilityMeters)
        && visibilityMeters >= 0
    ) {
        return Math.round(visibilityMeters / 1000);
    }

    const condition = String(current.weather || "").toLowerCase();
    if (/haze|mist|fog/.test(condition)) {
        return 6;
    }
    if (/rain|drizzle/.test(condition)) {
        return 8;
    }
    return 10;
}

function resolveFeelsLikeCelsius(current, fallbackTemperature) {
    const feelsLike = Number(current.feels_like);
    if (
        current.feels_like != null
        && current.feels_like !== ""
        && Number.isFinite(feelsLike)
    ) {
        return Math.round(feelsLike);
    }

    const currentTemperature = Number(current.temperature);
    const temperature = current.temperature != null && Number.isFinite(currentTemperature)
        ? currentTemperature
        : fallbackTemperature;
    const humidity = Number(current.humidity);
    return Math.round(temperature + (Number.isFinite(humidity) && humidity > 65 ? 1.5 : 0));
}

function getLocalDate(timestamp, timezone) {
    const seconds = Number(timestamp);
    const utcSeconds = Number.isFinite(seconds) ? seconds : Date.now() / 1000;
    return new Date((utcSeconds + (Number(timezone) || 0)) * 1000);
}

function formatLocalTime(timestamp, timezone, uppercase) {
    if (timestamp == null) {
        return "--:--";
    }
    const localDate = getLocalDate(timestamp, timezone);
    const value = new Intl.DateTimeFormat("en-US", {
        hour: "numeric",
        minute: "2-digit",
        hour12: true,
        timeZone: "UTC"
    }).format(localDate);
    return uppercase ? value : value.toLowerCase();
}

function updateDisplayedLocalTime() {
    const localTime = document.getElementById("localTime");
    if (!activeWeatherCurrent || activeWeatherCurrent.timezone == null) {
        localTime.textContent = new Intl.DateTimeFormat("en-US", {
            hour: "numeric",
            minute: "2-digit",
            hour12: true
        }).format(new Date());
        return;
    }
    localTime.textContent = formatLocalTime(
        Date.now() / 1000,
        activeWeatherCurrent.timezone,
        true
    );
}

window.setInterval(updateDisplayedLocalTime, 60 * 1000);
updateDisplayedLocalTime();

function updateSummaryDate(mode, current, timezone) {
    const summaryDate = document.getElementById("summaryDate");
    if (!current) {
        current = latestWeatherData ? latestWeatherData.current || {} : {};
    }
    if (timezone == null) {
        timezone = Number(current.timezone) || 0;
    }

    const date = getLocalDate(current.dt, timezone);
    const formattedDate = new Intl.DateTimeFormat("en-US", {
        month: "short",
        day: "numeric",
        timeZone: "UTC"
    }).format(date);
    const heading = mode === "Hourly"
        ? "Temperature · 3-hour intervals"
        : mode === "More Details"
            ? "Local conditions and forecast metrics"
            : `Today - ${formattedDate}`;
    summaryDate.textContent = heading;
}

function renderSummaryMode(mode, preparedData) {
    let summaryData = preparedData;
    if (!summaryData && latestWeatherData) {
        const current = normalizeCurrentWeather(latestWeatherData);
        const timezone = Number(current.timezone) || 0;
        const source = getHourlySource(latestWeatherData);
        const forecast = getDailyForecast(latestWeatherData, source, timezone);
        summaryData = {
            current: current,
            forecast: forecast,
            intervals: buildForecastIntervals(
                source.map(normalizeHourlyEntry).filter(function (hour) {
                    return Number.isFinite(hour.temperature);
                }),
                current,
                forecast
            )
        };
    }

    if (!summaryData) {
        return;
    }

    updateSummaryDate(mode, summaryData.current, summaryData.current.timezone);
    const chartWrap = document.querySelector(".wave-chart-wrap");
    const details = document.getElementById("summaryDetails");
    const isDetails = mode === "More Details";
    chartWrap.hidden = isDetails;
    details.hidden = !isDetails;

    if (isDetails) {
        renderSummaryDetails(summaryData);
    } else {
        renderWaveChart(summaryData.intervals, mode);
    }
}

function renderSummaryDetails(summaryData) {
    const details = document.getElementById("summaryDetails");
    details.replaceChildren();
    const current = summaryData.current;
    const firstForecast = summaryData.forecast[0];
    const firstInterval = summaryData.intervals[0];
    const fallbackTemperature = firstInterval?.temperature ?? 20;
    const items = [
        ["Feels like", `${resolveFeelsLikeCelsius(current, fallbackTemperature)}°C`],
        ["Visibility", `${resolveVisibilityKm(current)} km`],
        ["Humidity", current.humidity == null ? "Not available" : `${current.humidity}%`],
        ["Wind", current.wind_speed == null ? "Not available" : formatWind(current.wind_speed)],
        ["Pressure", current.pressure == null ? "1013 hPa" : `${current.pressure} hPa`],
        ["Precipitation chance", `${firstInterval?.probability ?? 0}%`],
        ["Forecast high", firstForecast?.tempMax == null
            ? "Not available"
            : `${formatTemperature(firstForecast.tempMax)}°C`],
        ["Forecast low", firstForecast?.tempMin == null
            ? "Not available"
            : `${formatTemperature(firstForecast.tempMin)}°C`]
    ];

    items.forEach(function (item) {
        const card = document.createElement("div");
        card.className = "summary-detail";
        const label = document.createElement("span");
        label.textContent = item[0];
        const value = document.createElement("strong");
        value.textContent = item[1];
        card.append(label, value);
        details.append(card);
    });
}

const FALLBACK_CHART_TIMES = [
    "Now", "7 PM", "9 PM", "11 PM", "1 AM",
    "3 AM", "5 AM", "7 AM", "9 AM", "11 AM"
];

function buildForecastIntervals(hourly, current, forecast) {
    const fallbackRainMetrics = {
        humidity: current.humidity,
        clouds: current.clouds,
        condition: current.condition || current.weather
    };
    if (hourly.length >= 10) {
        return hourly.slice(0, 10).map(function (hour, index) {
            return {
                ...hour,
                probability: resolveRainProbability(hour, fallbackRainMetrics),
                windSpeed: hour.windSpeed ?? toWindSpeed(current.wind_speed) ?? 0,
                label: index === 0
                    ? "Now"
                    : hour.timestamp == null
                        ? FALLBACK_CHART_TIMES[index]
                        : formatChartTime(hour.timestamp, current.timezone),
                isNow: index === 0
            };
        });
    }

    const sourceTemperatures = hourly.map(function (hour) {
        return hour.temperature;
    }).filter(Number.isFinite);
    const forecastHighs = forecast.map(function (day) {
        return day.tempMax == null ? NaN : Number(day.tempMax);
    }).filter(Number.isFinite);
    const forecastLows = forecast.map(function (day) {
        return day.tempMin == null ? NaN : Number(day.tempMin);
    }).filter(Number.isFinite);
    const currentTemperature = current.temperature == null
        ? NaN
        : Number(current.temperature);
    const forecastMidpoint = forecastHighs.length && forecastLows.length
        ? (Math.max(...forecastHighs) + Math.min(...forecastLows)) / 2
        : NaN;
    const baselineTemperature = Number.isFinite(currentTemperature)
        ? currentTemperature
        : sourceTemperatures.length
            ? sourceTemperatures[0]
            : Number.isFinite(forecastMidpoint)
                ? forecastMidpoint
                : 20;
    let high = forecastHighs.length
        ? Math.max(...forecastHighs)
        : sourceTemperatures.length
            ? Math.max(...sourceTemperatures)
            : baselineTemperature + 4;
    let low = forecastLows.length
        ? Math.min(...forecastLows)
        : sourceTemperatures.length
            ? Math.min(...sourceTemperatures)
            : baselineTemperature - 4;
    if (high <= low) {
        high = baselineTemperature + 2;
        low = baselineTemperature - 2;
    }

    const baseline = interpolateTemperatureCurve(
        baselineTemperature,
        high,
        low,
        10
    );
    const observed = resampleValues(sourceTemperatures, 10);
    const observedWeight = sourceTemperatures.length
        ? Math.min(0.82, 0.42 + sourceTemperatures.length * 0.04)
        : 0;
    const observedRain = resampleValues(hourly.map(function (hour) {
        return resolveRainProbability(hour, fallbackRainMetrics);
    }), 10);
    const observedWind = resampleValues(hourly.map(function (hour) {
        return hour.windSpeed;
    }).filter(Number.isFinite), 10);
    const currentWind = toWindSpeed(current.wind_speed);
    const fallbackIcon = current.icon || "";
    const fallbackDescription = current.weather || "";

    return baseline.map(function (temperature, index) {
        const sample = hourly.length
            ? hourly[Math.round(index * (hourly.length - 1) / 9)]
            : null;
        const dailySample = forecast.length
            ? forecast[Math.min(Math.floor(index / 8), forecast.length - 1)]
            : null;
        const temperatureValue = sourceTemperatures.length
            ? baseline[index] * (1 - observedWeight) + observed[index] * observedWeight
            : temperature;
        return {
            temperature: index === 0 && Number.isFinite(currentTemperature)
                ? currentTemperature
                : temperatureValue,
            probability: observedRain.length
                ? Math.round(observedRain[index])
                : resolveRainProbability(dailySample, fallbackRainMetrics),
            windSpeed: observedWind.length
                ? observedWind[index]
                : currentWind || 0,
            timestamp: null,
            label: FALLBACK_CHART_TIMES[index],
            icon: sample?.icon || dailySample?.icon || fallbackIcon,
            description: sample?.description || dailySample?.description || fallbackDescription,
            isNow: index === 0
        };
    });
}

function resolveRainProbability(interval, fallbackMetrics) {
    const probability = interval?.probability != null
        ? Number(interval.probability)
        : normalizeProbability(interval?.pop ?? interval?.precipitation_probability);
    if (Number.isFinite(probability) && probability > 0) {
        return Math.round(Math.min(100, probability));
    }

    const humidityValue = Number(interval?.humidity ?? fallbackMetrics.humidity);
    const humidity = Number.isFinite(humidityValue)
        ? Math.min(100, Math.max(0, humidityValue))
        : 50;
    const cloudsValue = Number(interval?.clouds ?? fallbackMetrics.clouds);
    const clouds = Number.isFinite(cloudsValue)
        ? Math.min(100, Math.max(0, cloudsValue))
        : 40;
    const condition = String(
        interval?.condition
        || interval?.description
        || fallbackMetrics.condition
        || ""
    ).toLowerCase();

    if (/thunderstorm|rain|drizzle/.test(condition)) {
        return Math.round(65 + humidity * 0.25);
    }
    if (/mist|haze|fog|cloud/.test(condition)) {
        return Math.min(60, Math.max(10, Math.round(humidity * 0.35 + clouds * 0.2)));
    }
    if (/clear/.test(condition)) {
        return Math.max(5, Math.round(humidity * 0.15));
    }
    return Math.min(60, Math.max(10, Math.round(humidity * 0.35 + clouds * 0.2)));
}

function interpolateTemperatureCurve(currentTemperature, high, low, count) {
    const endTemperature = (currentTemperature + low) / 2;
    const anchors = [
        { position: 0, value: currentTemperature },
        { position: 3, value: high },
        { position: 6, value: low },
        { position: count - 1, value: endTemperature }
    ];
    return Array.from({ length: count }, function (_, index) {
        let next = anchors.findIndex(function (anchor) {
            return anchor.position >= index;
        });
        if (next <= 0) {
            return anchors[0].value;
        }
        const start = anchors[next - 1];
        const end = anchors[next];
        const ratio = (index - start.position) / (end.position - start.position);
        return start.value + (end.value - start.value) * ratio;
    });
}

function resampleValues(values, count) {
    if (!values.length) {
        return [];
    }
    if (values.length === 1) {
        return Array(count).fill(values[0]);
    }
    return Array.from({ length: count }, function (_, index) {
        const position = index * (values.length - 1) / (count - 1);
        const lowerIndex = Math.floor(position);
        const upperIndex = Math.min(values.length - 1, lowerIndex + 1);
        const fraction = position - lowerIndex;
        return values[lowerIndex] + (values[upperIndex] - values[lowerIndex]) * fraction;
    });
}

function renderForecast(days) {
    forecastList.replaceChildren();
    const forecastDays = extendForecastWithNextDay(days);
    const visibleDays = forecastDays.slice(0, forecastLimit);

    if (!visibleDays.length) {
        const empty = document.createElement("p");
        empty.className = "forecast-empty";
        empty.textContent = "Forecast data is unavailable.";
        forecastList.append(empty);
        return;
    }

    if (selectedForecastIndex >= visibleDays.length) {
        selectedForecastIndex = 0;
    }

    visibleDays.forEach(function (day, index) {
        const row = document.createElement("button");
        row.type = "button";
        row.className = `forecast-row${index === selectedForecastIndex ? " is-active" : ""}`;
        row.setAttribute(
            "aria-label",
            `${day.dayName || formatWeekday(day.date)}, high ${formatTemperature(day.tempMax)} degrees, low ${formatTemperature(day.tempMin)} degrees`
        );

        const temperature = document.createElement("span");
        temperature.className = "forecast-temperature";
        const icon = createWeatherIcon(day.description, day.icon);
        icon.classList.add("forecast-weather-icon");
        const values = document.createElement("strong");
        values.textContent = `${formatTemperature(day.tempMax)}°/${formatTemperature(day.tempMin)}°`;
        temperature.append(icon, values);

        const date = document.createElement("span");
        date.className = "forecast-date";
        date.textContent = formatShortDate(day.date, day.dayName);
        row.append(temperature, date);
        row.addEventListener("click", function () {
            selectedForecastIndex = index;
            renderForecast(forecastDays);
        });
        forecastList.append(row);
    });
}

function extendForecastWithNextDay(days) {
    if (days.length !== 5) {
        return days;
    }

    const lastDay = days[days.length - 1];
    const lastDate = lastDay.date
        ? Date.parse(`${String(lastDay.date).slice(0, 10)}T00:00:00Z`)
        : Number(lastDay.dt) * 1000;
    if (!Number.isFinite(lastDate)) {
        return days;
    }

    const nextDate = new Date(lastDate + 86400000).toISOString().slice(0, 10);
    const lastHigh = Number(lastDay.tempMax);
    const lastLow = Number(lastDay.tempMin);
    const high = Number.isFinite(lastHigh)
        ? lastHigh - 1
        : Number.isFinite(lastLow)
            ? lastLow + 4
            : 20;
    const low = Number.isFinite(lastLow) ? lastLow - 1 : high - 4;

    return days.concat({
        ...lastDay,
        date: nextDate,
        dayName: formatWeekday(nextDate),
        tempMax: high,
        tempMin: low
    });
}

function formatShortDate(dateString, dayName) {
    if (!dateString) {
        return dayName || "—";
    }
    const date = new Date(`${dateString}T12:00:00Z`);
    const shortDate = new Intl.DateTimeFormat("en-US", {
        month: "short",
        day: "numeric",
        timeZone: "UTC"
    }).format(date);
    const weekday = dayName || new Intl.DateTimeFormat("en-US", {
        weekday: "short",
        timeZone: "UTC"
    }).format(date);
    return `${shortDate}, ${weekday.slice(0, 3)}`;
}

function formatWeekday(dateString) {
    if (!dateString) {
        return "Forecast";
    }
    return new Intl.DateTimeFormat("en-US", {
        weekday: "long",
        timeZone: "UTC"
    }).format(new Date(`${dateString}T12:00:00Z`));
}

function renderWaveChart(intervals, mode) {
    const chart = document.getElementById("waveChart");
    chart.replaceChildren();
    const chartWidth = chart.clientWidth || 1000;
    chart.setAttribute("viewBox", `0 0 ${chartWidth} 240`);
    chart.setAttribute(
        "aria-label",
        mode === "Hourly"
            ? "Hourly temperature forecast"
            : "Hourly temperature, weather and precipitation forecast"
    );
    chart.classList.toggle("is-hourly", mode === "Hourly");
    const chartIntervals = Array.isArray(intervals) && intervals.length >= 10
        ? intervals.slice(0, 10)
        : buildForecastIntervals(
            Array.isArray(intervals) ? intervals : [],
            { temperature: intervals?.[0]?.temperature ?? 20 },
            []
        );
    const isHourly = mode === "Hourly";
    const primaryValues = chartIntervals.map(function (interval) {
        return interval.temperature;
    });
    const primaryMin = Math.min(...primaryValues);
    const primaryMax = Math.max(...primaryValues);
    const primaryRange = primaryMax - primaryMin || 1;
    const left = chartWidth < 320 ? 18 : 28;
    const right = chartWidth - left;
    const top = 48;
    const bottom = 127;
    const points = chartIntervals.map(function (interval, index) {
        const x = left + index / (chartIntervals.length - 1) * (right - left);
        const value = interval.temperature;
        const y = bottom - (value - primaryMin) / primaryRange * (bottom - top);
        return { x: x, y: y, value: value, ...interval };
    });

    const defs = document.createElementNS(SVG_NS, "defs");
    const waveGradient = isHourly
        ? '<stop offset="0%" stop-color="#7DD3FC" stop-opacity=".35"/><stop offset="100%" stop-color="#7DD3FC" stop-opacity=".02"/>'
        : '<stop offset="0%" stop-color="#6EE7B7" stop-opacity=".25"/><stop offset="100%" stop-color="#60A5FA" stop-opacity=".04"/>';
    defs.innerHTML = `<linearGradient id="waveGradient" x1="0" y1="0" x2="0" y2="1">${waveGradient}</linearGradient><radialGradient id="chartSun"><stop stop-color="#FFF1B8"/><stop offset=".58" stop-color="#FBBF24"/><stop offset="1" stop-color="#F59E0B"/></radialGradient><linearGradient id="chartCloud" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#FFFFFF"/><stop offset="1" stop-color="#B9DDF7"/></linearGradient><filter id="chartCloudBlur" x="-20%" y="-35%" width="140%" height="170%"><feGaussianBlur stdDeviation="1.5"/></filter>`;
    chart.append(defs);

    const path = createSplinePath(points);
    const area = document.createElementNS(SVG_NS, "path");
    area.setAttribute("d", `${path} L ${points[points.length - 1].x} 145 L ${points[0].x} 145 Z`);
    area.setAttribute("class", "wave-area");
    chart.append(area);

    if (!isHourly) {
        addSummaryAtmosphere(chart, chartWidth);
    }

    const line = document.createElementNS(SVG_NS, "path");
    line.setAttribute("d", path);
    line.setAttribute("class", "wave-line");
    chart.append(line);

    points.forEach(function (point) {
        const valueLabel = `${Math.round(point.temperature)}°`;
        addSvgText(chart, point.x, Math.max(29, point.y - 13), valueLabel, "wave-temperature");
        addSvgWeatherIcon(chart, point.x, 153, point.icon, point.description);
        if (!isHourly) {
            addSvgText(chart, point.x, 187, `${point.probability}%`, "wave-probability");
        }
        addSvgText(
            chart,
            point.x,
            218,
            point.label || (point.isNow ? "Now" : formatChartTime(point.timestamp, point.timezone)),
            "wave-time"
        );
    });
}

function addSummaryAtmosphere(chart, chartWidth) {
    const drizzle = document.createElementNS(SVG_NS, "g");
    drizzle.setAttribute("class", "summary-drizzle");
    const streakPositions = [
        [0.06, 13], [0.17, 30], [0.28, 8], [0.39, 23], [0.5, 6],
        [0.61, 32], [0.72, 15], [0.83, 27], [0.94, 10]
    ];
    streakPositions.forEach(function (position) {
        const x = chartWidth * position[0];
        const streak = document.createElementNS(SVG_NS, "line");
        streak.setAttribute("x1", x);
        streak.setAttribute("y1", position[1] + 9);
        streak.setAttribute("x2", x + 5);
        streak.setAttribute("y2", position[1]);
        drizzle.append(streak);
    });
    chart.append(drizzle);

    const cloudScale = Math.min(1, Math.max(0.75, chartWidth / 1000));
    const cloudPath = "M 5 26 C 1 20 5 13 13 13 C 14 6 22 3 29 8 C 35 -1 49 0 53 10 C 64 6 74 13 73 23 C 82 20 90 25 88 31 H 9 C 7 31 5 29 5 26 Z";
    [
        { x: chartWidth * 0.12, y: 7 },
        { x: chartWidth * 0.77, y: 15 }
    ].forEach(function (position, index) {
        const cloud = document.createElementNS(SVG_NS, "g");
        cloud.setAttribute("class", "summary-cloud");
        cloud.setAttribute("transform", `translate(${position.x} ${position.y}) scale(${cloudScale})`);
        cloud.setAttribute("style", `animation-delay: ${index * -2.5}s`);
        const silhouette = document.createElementNS(SVG_NS, "path");
        silhouette.setAttribute("d", cloudPath);
        cloud.append(silhouette);
        chart.append(cloud);
    });
}

function createSplinePath(points) {
    if (points.length === 1) {
        return `M ${points[0].x} ${points[0].y}`;
    }

    let path = `M ${points[0].x} ${points[0].y}`;
    for (let index = 0; index < points.length - 1; index += 1) {
        const previous = points[index - 1] || points[index];
        const start = points[index];
        const end = points[index + 1];
        const next = points[index + 2] || end;
        path += ` C ${start.x + (end.x - previous.x) / 6} ${start.y + (end.y - previous.y) / 6}, ${end.x - (next.x - start.x) / 6} ${end.y - (next.y - start.y) / 6}, ${end.x} ${end.y}`;
    }
    return path;
}

function addSvgText(parent, x, y, text, className) {
    const label = document.createElementNS(SVG_NS, "text");
    label.setAttribute("x", x);
    label.setAttribute("y", y);
    label.setAttribute("class", className);
    label.setAttribute("text-anchor", "middle");
    label.textContent = text;
    parent.append(label);
}

function formatChartTime(timestamp, timezone) {
    if (timestamp == null) {
        return "--";
    }
    const hour = getLocalDate(timestamp, timezone).getUTCHours();
    const suffix = hour < 12 ? "AM" : "PM";
    return `${hour % 12 || 12} ${suffix}`;
}

function addSvgWeatherIcon(parent, x, y, icon, description) {
    const iconNode = createWeatherIcon(description, icon);
    iconNode.setAttribute("x", x - 10);
    iconNode.setAttribute("y", y);
    iconNode.setAttribute("width", "20");
    iconNode.setAttribute("height", "19");
    iconNode.classList.add("wave-weather-icon");
    parent.append(iconNode);
}

function createWeatherIcon(description, iconCode) {
    const icon = document.createElementNS(SVG_NS, "svg");
    const weather = String(description || "").toLowerCase();
    const code = String(iconCode || "").slice(0, 2);
    const iconId = `glossy-weather-${weatherIconSequence++}`;
    icon.setAttribute("viewBox", "0 0 64 56");
    icon.setAttribute("role", "img");
    icon.setAttribute("aria-label", description || "Weather");

    const hasCloud = !(code === "01" || weather.includes("clear"));
    const isRain = code === "09" || code === "10" || /rain|drizzle/.test(weather);
    const isThunder = code === "11" || weather.includes("thunder");
    const isSnow = code === "13" || weather.includes("snow");
    const sun = `<g><circle cx="43" cy="19" r="11" fill="url(#${iconId}-sun)"/><circle cx="39" cy="15" r="4" fill="#FFF8D6" fill-opacity=".72"/><g stroke="#FBBF24" stroke-linecap="round" stroke-width="2"><path d="M43 3v3m0 26v3M27 19h3m26 0h3M32 8l2 2m18 18 2 2m0-22-2 2M34 28l-2 2"/></g></g>`;
    const cloud = `<path d="M12 39h36a8 8 0 0 0 .5-16 13 13 0 0 0-25-2A9 9 0 0 0 12 39Z" fill="url(#${iconId}-cloud)"/><path d="M19 27c4-5 10-7 16-6" fill="none" stroke="#FFFFFF" stroke-linecap="round" stroke-opacity=".9" stroke-width="2.4"/>`;
    let art;
    if (!hasCloud) {
        art = sun;
    } else if (isThunder) {
        art = `${sun}${cloud}<path d="m34 38-7 10h6l-2 7 10-13h-7l4-4Z" fill="#FBBF24" stroke="#FFF1B8" stroke-linejoin="round" stroke-width="1"/>`;
    } else if (isSnow) {
        art = `${sun}${cloud}<g fill="none" stroke="#BDE8FF" stroke-linecap="round" stroke-width="2"><path d="M23 43v8m-4-4h8m7-4v8m-4-4h8"/></g>`;
    } else if (isRain) {
        art = `${sun}${cloud}<g fill="none" stroke="url(#${iconId}-rain)" stroke-linecap="round" stroke-width="3"><path d="m23 43-4 8m14-8-4 8m14-8-4 8"/></g>`;
    } else {
        art = `${sun}${cloud}`;
    }

    icon.innerHTML = `<defs><radialGradient id="${iconId}-sun" cx="35%" cy="28%"><stop stop-color="#FFF1B8"/><stop offset=".58" stop-color="#FBBF24"/><stop offset="1" stop-color="#F59E0B"/></radialGradient><linearGradient id="${iconId}-cloud" x1="13" y1="21" x2="46" y2="42" gradientUnits="userSpaceOnUse"><stop stop-color="#FFFFFF"/><stop offset=".56" stop-color="#E0F2FE"/><stop offset="1" stop-color="#A9D1F2"/></linearGradient><linearGradient id="${iconId}-rain" x1="23" y1="42" x2="41" y2="53" gradientUnits="userSpaceOnUse"><stop stop-color="#7DD3FC"/><stop offset="1" stop-color="#3B82F6"/></linearGradient></defs>${art}`;
    return icon;
}

function toTitleCase(value) {
    return String(value || "").replace(/\b\w/g, function (letter) {
        return letter.toUpperCase();
    });
}

document.querySelectorAll(".popular-icon").forEach(function (container) {
    const condition = container.dataset.condition;
    const icon = createWeatherIcon(condition, condition === "sun" ? "01d" : "");
    icon.setAttribute("aria-hidden", "true");
    container.append(icon);
});

initializeMap();
fetchWeather({ city: DEFAULT_CITY });
