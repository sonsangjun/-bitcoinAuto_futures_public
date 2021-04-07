const winston = require('winston');            // winston lib
const winstonDaily = require('winston-daily-rotate-file');
const process = require('process');
const dotenv = require('dotenv');

dotenv.config();

const isDev = (process.env.NODE_ENV !== 'production' ? true : false);
const modeStr = isDev ? 'development' : 'production';
const symbol = process.env.targetSymbol;
const basePath = process.env.logBasePath;

let logDir = (modeStr==='production'?'log/nodejs/f_auto/production/':'log/nodejs/f_auto/development/');  // 디렉토리 로그 파일 저장
logDir = basePath + logDir + symbol;

const { combine, timestamp, printf } = winston.format;

// Define log format
const logFormat = printf(info => {
  return `${info.timestamp} ${info.level}: ${info.message}`;
});

/*
 * Log Level
 * error: 0, warn: 1, info: 2, http: 3, verbose: 4, debug: 5, silly: 6
 */
let loggerOgj = [
  new winstonDaily({
    level: 'debug',
    datePattern: 'YYYY-MM-DD',
    dirname: logDir+'/debug',
    filename: `%DATE%.log`,
    maxFiles: 90,  // 90일치 로그 파일 저장
    zippedArchive: true, 
  }), 
  // error 레벨 로그를 저장할 파일 설정
  new winstonDaily({
    level: 'error',
    datePattern: 'YYYY-MM-DD',
    dirname: logDir + '/error',  
    filename: `%DATE%.error.log`,
    maxFiles: 90, // 90일치 로그 파일 저장
    zippedArchive: true,
  })
];

const logger = winston.createLogger({
  level : 'debug', // 로그레벨
  format: combine( timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }), logFormat ),
  transports: loggerOgj,
});

// Production 환경이 아닌 경우(dev 등) 
// winston.format.colorize(),   색깔 넣어서 출력
// winston.format.simple(),     `${info.level}: ${info.message} JSON.stringify({ ...rest })` 포맷으로 출력
if (isDev) {
  logger.add(
    new winston.transports.Console({
      format: winston.format.combine( winston.format.colorize(), winston.format.simple() )
    })
  );
}
 
module.exports = logger;
