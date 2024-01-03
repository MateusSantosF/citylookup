const axios = require('axios');
const XLSX = require('xlsx');
const fs = require('fs');
const { Guid } = require('js-guid');


const REQUEST_DELAY_IN_MS = 1001

// Settings related to search
const searchOptions = {
    format: "json",
    featureType: "city", // country, state, city, settlement
    resultLimit: 1,
    UF: "SP", // Leave empty if the search is not for a specific city
    country: "Brasil",
}

const validationOptions = {
    addressType: ["municipality"], // municipality | village | region | city | town | city_district
    type: ["administrative"], // suburb |  administrative | village | peak | city | town
    class: ["boundary"], // boundary || place
    keywords: ["Brasil", "São Paulo"] // Fields to match against the API response in the displayName property
};

// Settings related to the database.
const TABLE_NAME = 'YOUR_TABLE_NAME'
const TABLE_COLUMNS = [
    'UF',
    'StateName',
    'intermediateGeographicalRegionCode',
    'intermediateGeographicalRegionName',
    'fullMunicipalityCode',
    'cityName',
]
const PRIMARY_KEY_COLUMN = "id";
const MISSING_COLUMNS = ['lon', 'lat', 'id']
TABLE_COLUMNS.push(...MISSING_COLUMNS);
const FLOAT_COLUMNS = [
    'lon',
    'lat',
]

const INTEGER_COLUMNS = [
    "UF",
    'intermediateGeographicalRegionCode',
    'fullMunicipalityCode'
]

const isSubset = (sub, sup) => sub.every(val => sup.includes(val));

const floatColumnsExist = isSubset(FLOAT_COLUMNS, TABLE_COLUMNS);
const intColumnsExist = isSubset(INTEGER_COLUMNS, TABLE_COLUMNS);

console.log(`Float columns exist in TABLE_COLUMNS: ${floatColumnsExist}`);
console.log(`Integer columns exist in TABLE_COLUMNS: ${intColumnsExist}`);

if (!floatColumnsExist || !intColumnsExist) {
    throw new Error("numeric columns dont match with table columns.")
}

// Settings related to the Excel file.
const header = ['UF', 'Nome_UF', 'Região Geográfica Intermediária', 'Nome Região Geográfica Intermediária', 'Código Município Completo', 'Nome_Município'];
const SPREAD_SHEET_SEARCH_COLUMN = 'Nome_Município'
const SPREAD_SHEET_PATH = "DTB_SP.xlsx"

/*
https://nominatim.org/release-docs/develop/api/Search/
*/
const BASE_URL = `https://nominatim.openstreetmap.org/search?format=${searchOptions.format}&limit=${searchOptions.resultLimit}&featureType=${searchOptions.featureType}`

async function main() {
    let data = await readSpreedSheet();
    const queryValues = [];
    for (const currentRow of data) {
        const query = currentRow[SPREAD_SHEET_SEARCH_COLUMN];
        console.log(`processing entry=${query}`)
        await sleep();
        const responseData = await fetchRegionInformation(query);
        buildInsertQueryValues(queryValues, currentRow, responseData);
    }

    const insertQueryData = generateInsertQuery(queryValues);
    writeInsertQueryToFile(insertQueryData);
}


async function readSpreedSheet() {
    return new Promise((resolve, reject) => {
        const workbook = XLSX.readFile(SPREAD_SHEET_PATH);
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        const data = XLSX.utils.sheet_to_json(worksheet, { header });

        // filter only header corresponding rows
        const filteredData = data.filter(row => {
            const rowKeys = Object.keys(row).map(key => key.trim());
            const headerKeys = header.map(key => key.trim());
            return headerKeys.every(key => rowKeys.includes(key));
        });

        resolve(filteredData.splice(0)); // splice(0) to skip header
    });
}

function buildInsertQueryValues(queryValues, currentRow, responseData) {

    const obj = {};
    const missingColumnsSet = new Set(MISSING_COLUMNS);

    TABLE_COLUMNS.forEach((column, index) => {
        if (missingColumnsSet.has(column)) {
            obj[column] = mapMissingColumns(column, responseData)
        } else {
            obj[column] = currentRow[header[index]]
        }
    })

    queryValues.push(obj);
}

function mapMissingColumns(column, responseData) {

    switch (column) {
        case 'lon':
            return responseData.longitude;
        case 'lat':
            return responseData.latitude;
        case PRIMARY_KEY_COLUMN:
            return Guid.newGuid();
    }
}


async function fetchRegionInformation(query) {
    const defaultValue = { latitude: null, longitude: null };

    try {
        if (typeof query !== 'string' || !query.trim()) {
            console.log('Invalid query string');
            return defaultValue;
        }

        const formatedQuery = query.split(',').join('+');
        const response = await axios.get(`${BASE_URL}&q=${searchOptions.UF}+${formatedQuery}`, {
            headers: {
                'User-Agent': 'citylookup/v1.0' // Replace 'YourAppName' with your actual app 
            }
        });

        const data = response.data;
        if (!data || data.length === 0) {
            console.log(`query ${query} return default values.`);
            return defaultValue;
        }

        if (!checkKeywords(data)) {
            console.log(`Keywords not found for the search.: ${formatedQuery}`);
            console.log(`Response: ${JSON.stringify(data, null, 2)}`);
        }

        if (!checkRestrictions(data)) {
            console.log(`No results were found that match the restrictions for ${formatedQuery}`);
            console.log(`Response: ${JSON.stringify(data, null, 2)}`);

        }

        const coordinates = extractCoordinates(data[0]);
        return coordinates;
    } catch (err) {
        console.log(`There was an error in searching for the word: ${query}.`);
        console.error(err);
        return defaultValue;
    }
}

function checkKeywords(data) {
    return data.some((result) => {
        const lowerCaseDisplayName = result.display_name.toLowerCase();
        return validationOptions.keywords.some((word) => lowerCaseDisplayName.includes(word.toLowerCase()));
    });
}

function checkRestrictions(data) {
    const firstResult = data[0];

    const isTypeValid = validationOptions.type.includes(firstResult.type);
    const isAddressTypeValid = validationOptions.addressType.includes(firstResult.addresstype);
    const isClassValid = validationOptions.class.includes(firstResult.class);
    console.log(`isTypeValid: ${isTypeValid} | isAddressTypeValid: ${isAddressTypeValid} |  isClassValid: ${isClassValid}`)
    return isTypeValid && isAddressTypeValid && isClassValid;
}

function extractCoordinates(result) {
    return {
        latitude: parseFloat(result.lat),
        longitude: parseFloat(result.lon)
    };
}

function generateInsertQuery(valuesArray) {
    const columnNames = TABLE_COLUMNS.join(', ');
    const floatColumns = new Set(FLOAT_COLUMNS);
    const integerColumns = new Set(INTEGER_COLUMNS);

    const valueStrings = valuesArray.map((values) => {
        const valueList = TABLE_COLUMNS.map((column) => {
            const value = values[column];
            if (value === undefined || value === null) {
                return 'NULL';
            } else if (floatColumns.has(column)) {
                return typeof value === 'string' ? parseFloat(value) : value;
            } else if (integerColumns.has(column)) {
                return typeof value === 'string' ? parseInt(value) : value;
            }
            else {
                return `'${value.replace("'", "''")}'`;
            }
        });
        return `(${valueList.join(', ')})`;
    });

    const valuesString = valueStrings.join(',\n\t');

    const insertQuery = `INSERT INTO\n${TABLE_NAME} (${columnNames})\nVALUES\n${valuesString};`;

    return insertQuery;
}

function writeInsertQueryToFile(insertQuery) {
    fs.writeFile('insert.sql', insertQuery, (err) => {
        if (err) {
            console.error("There was an error while writing to the file.", err);
            return;
        }
        console.log("INSERT query has been successfully written to the insert.sql file.");
    });
}

function sleep(ms = REQUEST_DELAY_IN_MS) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

main();