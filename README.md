# Weather Data Fetcher

## Project Description
A serverless weather API built using AWS Lambda,
Amazon API Gateway, Python and OpenWeatherMap.

## Technologies
- Python
- AWS Lambda
- Amazon API Gateway
- OpenWeatherMap API
- JSON
- GitHub

## Features
- Search weather by city name.
- Get temperature in Celsius and feels-like temperature
- Get humidity
- Get weather description
- Get wind speed
- Get visibility and pressure
- Get a 5-day forecast with daily temperature ranges
- Get hourly temperatures and precipitation probabilities
- Get local sunrise, sunset, and current time
- Search by city or browser-provided coordinates
- JSON response

## API Endpoint
GET /weather?city=Kolkata
GET /weather?lat=22.5726&lon=88.3639

The response contains a `current` object with the weather location's coordinates,
an `hourly` array with up to ten three-hour intervals, and a `forecast` array
with the available daily summaries. The source forecast API currently provides
up to five days. Temperatures are in Celsius and wind speeds are in meters per
second; clients can convert them for display. Coordinate requests require both
`lat` and `lon`.

## Installation
1. Clone this repository.
2. Create an OpenWeatherMap API key.
3. Configure WEATHER_API_KEY in AWS Lambda.
4. Deploy the Lambda function.
5. Connect API Gateway.

## Author
Your Name