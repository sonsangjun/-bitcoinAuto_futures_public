const mysql = require('mysql');
const dotenv = require('dotenv');
const objUtil = require('../objectUtil')

let mysqlConfig = { };
dotenv.config();

/////////////////////////////////////////////////////////////////////////////////
// Intranet Option
/////////////////////////////////////////////////////////////////////////////////
const iscloud = objUtil.parseValue(process.env.iscloud);
const isDev = objUtil.checkDevMode();

const dbHost = (iscloud ? '0.0.0.0' : '0.0.0.0');
const passwd = (iscloud ? '{password}' : '{password}');

console.warn('iscloud(boolean,string):',iscloud,process.env.iscloud,', dbHost:',dbHost);

if (isDev) {
    mysqlConfig = {
        host : dbHost,
        user : '{user}',
        password : passwd,
        database : '{database}'        
    };
}else{
    mysqlConfig = {
        host : dbHost,
        user : '{user}',
        password : passwd,
        database : '{database}'        
    };
}

const connection = mysql.createConnection(mysqlConfig);
connection.connect();

module.exports = connection;