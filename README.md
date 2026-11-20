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
- Get temperature in Celsius
- Get humidity
- Get weather description
- Get wind speed
- Get a 5-day forecast with daily temperature ranges
- JSON response

## API Endpoint
GET /weather?city=Kolkata

The response contains a `current` object and a `forecast` array with up to five
days. Daily forecast temperatures are in Celsius.

## Installation
1. Clone this repository.
2. Create an OpenWeatherMap API key.
3. Configure WEATHER_API_KEY in AWS Lambda.
4. Deploy the Lambda function.
5. Connect API Gateway.

## Author
Your Name