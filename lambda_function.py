import json
import urllib.request
import urllib.parse
import urllib.error
import os


def lambda_handler(event, context):

    try:
        # Get city name
        params = event.get("queryStringParameters") or {}
        city = params.get("city")

        if not city or not city.strip():
            return {
                "statusCode": 400,
                "headers": {"Content-Type": "application/json"},
                "body": json.dumps({
                    "error": "City name is required"
                })
            }

        api_key = os.environ.get("WEATHER_API_KEY")

        if not api_key:
            raise RuntimeError("API key not configured")

        # Convert city name into latitude and longitude
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

        # Fetch current weather using coordinates
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

        with urllib.request.urlopen(weather_url, timeout=10) as response:
            data = json.loads(response.read())

        # Format weather information
        result = {
            "city": data["name"],
            "country": data["sys"]["country"],
            "temperature": data["main"]["temp"],
            "humidity": data["main"]["humidity"],
            "weather": data["weather"][0]["description"],
            "wind_speed": data["wind"]["speed"]
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