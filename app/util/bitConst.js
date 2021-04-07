module.exports = (function(){
    let constant = {};

    constant.TRADE_SYMBOL_USDT = {};
    constant.TRADE_SYMBOL_USDT.BTC = 'BTCUSDT';
    constant.TRADE_SYMBOL_USDT.BNB = 'BNBUSDT';

    constant.ACCOUT_SYMBOL = {};
    constant.ACCOUT_SYMBOL.BTC = 'BTC';
    constant.ACCOUT_SYMBOL.BNB = 'BNB';

    constant.FEE_BTC = {};
    constant.FEE_BTC.BNB = 'BNBBTC';

    constant.DATE_TYPE = {};
    constant.DATE_TYPE.DAY = 'D';
    constant.DATE_TYPE.MON = 'M';
    constant.DATE_TYPE.YER = 'Y';

    constant.DW_TYPE = {};
    constant.DW_TYPE.DEPO = 'D';   // 입금
    constant.DW_TYPE.WITHDR = 'W'; // 출금

    constant.DATE_MSEC = {};

    constant.DATE_MSEC.HOUR = 3600*1000;
    constant.DATE_MSEC.DAY = 86400*1000;

    constant.YN={};
    constant.YN.Y = 'Y';
    constant.YN.N = 'N';

    constant.HR = '##############################################################';

    /** 심볼에 따른 거래설정:기본 */
    constant.SYMBOL_COMM = 'COMM'; 

    /** Slack 변수 */
    constant.SLACK = {};
    constant.SLACK.TYPE = {};
    constant.SLACK.TYPE.ERROR = 'Error';
    constant.SLACK.TYPE.INFO = 'Info';
    constant.SLACK.TYPE.ORDER = 'Order';

    /** Futures */
    constant.FUTURES = {};
    constant.FUTURES.ORDER_TYPE = {};
    constant.FUTURES.ORDER_TYPE.SHORT = 'SHORT';
    constant.FUTURES.ORDER_TYPE.LONG = 'LONG';

    constant.FUTURES.MARGIN_TYPE = {};
    constant.FUTURES.MARGIN_TYPE.ISOLATED = 'ISOLATED';
    constant.FUTURES.MARGIN_TYPE.CROSSED = 'CROSSED';

    return constant;

})();