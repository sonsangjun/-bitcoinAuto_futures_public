const objUtil = require('../util/objectUtil');
const logger = require('../conf/winston');
const sqlObj = require('../util/sqlUtil');
const jsonUtil = require('../util/jsonUtil');
const dealSetSvc = require('../service/dealSetService');

const bConst = require('../util/bitConst');

module.exports = (function(){
    ///////////////////////////////////////////////////////////////////
    // Init Area
    const jsonObj = jsonUtil.getJsonObj('errorLogService');

    let svcObj = {};
    let isInit = false;
    let dealSet = {};

    svcObj.insertErrorCntn = function(json){
        if(!json){
            logger.debug(jsonObj.getMsgJson('-1','json is empty.'));
            return;
        }

        let el = {};
        el.errorMsg  = '[code:'+json.code+']'+json.msg;
        el.errorTime = Date.now();
        el.sendFlag  = 'N';
        el.sendTime  = 0;

        sqlObj.insertErrorHistory([el])
        .then((res)=>logger.debug(jsonObj.getMsgJson('0','insertErrorCntn success.')))
        .catch((err)=>logger.error(jsonObj.getMsgJson('-1','insertErrorCntn fail. '+objUtil.objView(err))));
    };

    // 에러 메일링 보내는 것은 설정값에 주기를 1시간정도로 설정하여
    // 에러가 존재시, 메일보내고 없으면 보내지 말 것.
    // dealService의 setTimeout으로 돌리는 로직 참고.

    // 에러 메일링은 docker 분리적용

    return svcObj;
})();