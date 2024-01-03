# IBGE Data Retrieval and SQL Script Generation

This Node.js project retrieves data from an Excel table related to the Brazilian Territorial Division [(DTB - Divisao Territorial Brasileira)](https://www.ibge.gov.br/geociencias/organizacao-do-territorio/estrutura-territorial/23701-divisao-territorial-brasileira.html). For each row in the spreadsheet, it fetches the longitude and latitude of the city/municipality using OpenStreetMap's geocoding service. Finally, it generates an SQL script with the data insertion statements.

## Overview

The script performs the following tasks:
- Reads an Excel file containing geographical data.
- Queries OpenStreetMap's API to fetch longitude and latitude for each city/municipality in the spreadsheet.
- Generates SQL INSERT statements for the retrieved data.

## Project Structure

### Libraries Used:
- `axios`: For making HTTP requests to the OpenStreetMap API.
- `xlsx`: For reading Excel files.
- `fs`: For file system operations.

### Settings and Configuration:

#### Search Options:
- `format`: Data format for API response (e.g., "json").
- `featureType`: Type of geographic feature to search for (e.g., "city", "country", etc.).
- `resultLimit`: Maximum number of search results to retrieve.
- `UF`: The state code to filter the search (leave empty for a broader search).
- `country`: Country for the search.

#### Validation Options:
- `addressType`: Array of address types to validate against the API response.
- `type`: Array of types to validate against the API response.
- `class`: Array of classes to validate against the API response.
- `keywords`: Keywords to match against the API response in the displayName property.

#### Database Settings:
- `TABLE_NAME`: Name of the database table.
- `TABLE_COLUMNS`: Array of column names in the database table.
- `PRIMARY_KEY_COLUMN`: Primary key column name.
- `MISSING_COLUMNS`: Array of columns that need to be fetched (e.g., 'lon', 'lat', 'id').
- `FLOAT_COLUMNS`: Array of columns that should be treated as floats.
- `INTEGER_COLUMNS`: Array of columns that should be treated as integers.

### Usage

1. Install dependencies by running `npm install`.
2. Ensure the Excel file path and settings are configured properly.
3. Run the script with `node index.js`.
4. The script will read the Excel file, fetch geolocation data, and generate an SQL script named `insert.sql`.
