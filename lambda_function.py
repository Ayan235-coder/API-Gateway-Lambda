import json
import urllib.request
import urllib.parse
import urllib.error
import os
import math
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone


def fetch_json(url):
    with urllib.request.urlopen(url, timeout=10) as response:
        return json.loads(response.read())


def lambda_handler(event, context):

    try:
        # Accept either a city search or coordinates from browser geolocation.
        params = event.get("queryStringParameters") or {}
        city = params.get("city")

        api_key = os.environ.get("WEATHER_API_KEY")

        if not api_key:
            raise RuntimeError("API key not configured")

        latitude = params.get("lat")
        longitude = params.get("lon")
        if latitude is not None or longitude is not None:
            try:
                lat = float(latitude)
                lon = float(longitude)
            except (TypeError, ValueError):
                return {
                    "statusCode": 400,
                    "headers": {"Content-Type": "application/json"},
                    "body": json.dumps({
                        "error": "Valid latitude and longitude are required"
                    })
                }

            if (
                not math.isfinite(lat)
                or not math.isfinite(lon)
                or not -90 <= lat <= 90
                or not -180 <= lon <= 180
            ):
                return {
                    "statusCode": 400,
                    "headers": {"Content-Type": "application/json"},
                    "body": json.dumps({
                        "error": "Valid latitude and longitude are required"
                    })
                }
        else:
            if not city or not city.strip():
                return {
                    "statusCode": 400,
                    "headers": {"Content-Type": "application/json"},
                    "body": json.dumps({
                        "error": "City name is required"
                    })
                }

            # Convert city name into latitude and longitude.
            geo_params = urllib.parse.urlencode({
                "q": city.strip(),
                "limit": 1,
                "appid": api_key
            })

            geo_url = (
                "https://api.openweathermap.org/geo/1.0/direct?"
                + geo_params
            )

            with urllib.request.urlopen(geo_url, timeout=10) as response:
                locations = json.loads(response.read())

            if not locations:
                return {
                    "statusCode": 404,
                    "headers": {"Content-Type": "application/json"},
                    "body": json.dumps({
                        "error": "City not found"
                    })
                }

            lat = locations[0]["lat"]
            lon = locations[0]["lon"]

        # Fetch current weather and forecast concurrently using coordinates.
        weather_params = urllib.parse.urlencode({
            "lat": lat,
            "lon": lon,
            "appid": api_key,
            "units": "metric"
        })
        weather_url = (
            "https://api.openweathermap.org/data/2.5/weather?"
            + weather_params
        )
        forecast_url = (
            "https://api.openweathermap.org/data/2.5/forecast?"
            + weather_params
        )

        with ThreadPoolExecutor(max_workers=2) as executor:
            current_future = executor.submit(fetch_json, weather_url)
            forecast_future = executor.submit(fetch_json, forecast_url)
            current_data = current_future.result()
            forecast_data = forecast_future.result()

        hourly_forecast = [
            {
                "dt": entry["dt"],
                "temp": entry["main"]["temp"],
                "pop": entry.get("pop", 0),
                "icon": entry["weather"][0]["icon"],
                "description": entry["weather"][0]["description"]
            }
            for entry in forecast_data["list"][:10]
        ]

        city_timezone = forecast_data.get(
            "city", {}
        ).get("timezone", current_data.get("timezone", 0))
        grouped_forecast = {}
        for entry in forecast_data["list"]:
            local_forecast_time = datetime.fromtimestamp(
                entry["dt"] + city_timezone, tz=timezone.utc
            )
            forecast_date = local_forecast_time.strftime("%Y-%m-%d")
            forecast_time = local_forecast_time.strftime("%H:%M:%S")
            grouped_forecast.setdefault(forecast_date, []).append(
                (forecast_time, entry)
            )

        daily_forecast = []
        for forecast_date, entries in sorted(grouped_forecast.items()):
            noon_entry = next(
                (entry for time, entry in entries if time == "12:00:00"),
                entries[0][1]
            )
            temperatures = [entry["main"]["temp"] for _, entry in entries]
            daily_forecast.append({
                "date": forecast_date,
                "dayName": datetime.strptime(
                    forecast_date, "%Y-%m-%d"
                ).strftime("%A"),
                "icon": noon_entry["weather"][0]["icon"],
                "description": noon_entry["weather"][0]["description"],
                "tempMin": min(temperatures),
                "tempMax": max(temperatures),
                "humidity": noon_entry["main"]["humidity"],
                "wind_speed": noon_entry["wind"]["speed"],
                "pop": max(entry.get("pop", 0) for _, entry in entries)
            })

        result = {
            "current": {
                "city": current_data["name"],
                "country": current_data["sys"]["country"],
                "temperature": current_data["main"]["temp"],
                "feels_like": current_data["main"]["feels_like"],
                "humidity": current_data["main"]["humidity"],
                "weather": current_data["weather"][0]["description"],
                "icon": current_data["weather"][0]["icon"],
                "wind_speed": current_data["wind"]["speed"],
                "visibility": current_data.get("visibility"),
                "pressure": current_data["main"]["pressure"],
                "sunrise": current_data["sys"].get("sunrise"),
                "sunset": current_data["sys"].get("sunset"),
                "timezone": current_data.get("timezone", 0),
                "dt": current_data.get("dt"),
                "latitude": lat,
                "longitude": lon
            },
            "hourly": hourly_forecast,
            "forecast": daily_forecast[:10]
        }

        return {
            "statusCode": 200,
            "headers": {"Content-Type": "application/json"},
            "body": json.dumps(result)
        }

    except urllib.error.HTTPError as error:

        status = 401 if error.code in (401, 403) else 502

        return {
            "statusCode": status,
            "headers": {"Content-Type": "application/json"},
            "body": json.dumps({
                "error": "Weather service request failed"
            })
        }

    except Exception:

        return {
            "statusCode": 500,
            "headers": {"Content-Type": "application/json"},
            "body": json.dumps({
                "error": "Internal server error"
            })
        }