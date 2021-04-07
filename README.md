# bitcoinAuto_futures_futures
> 코인선물 매매시스템

# 경고
> 해당코드를 이용한 선물 거래에 따른 손실은 책임지지 않습니다. <br/>
> 참고용도로만 사용해주세요. <br/>
> 
> 절대 사용하지 마세요. <br/>

## 시스템 성격
> 선물매매 시스템은 네이키드 매매가 아니라. <br/>
> 현물에 대한 헷지성격이다. <br/>
> <br/>
> 해당시스템은 숏포지션만 지속적으로 보유하며, <br/>
> 롱포지션은 숏포지션 청산시에만 사용한다. <br/>
> <br/>
> 헷지(보험)성격이므로, 현물 수익금의 일부에 한해 저배율 숏포지션을 계약한다. <br/>


## API-DOCS
> api-docs : https://binance-docs.github.io/apidocs/futures/en/#general-info <br/>

기본적으로 현물API호출방식과 유사해보인다. <br/>

## Testnet
> 현물과 다른점은 테스트 방법이다.  <br/>
> 선물은 아예 테스트화면을 따로 가지고 있다. <br/>

```
Most of the endpoints can be used in the testnet platform.
The REST baseurl for testnet is "https://testnet.binancefuture.com"
The Websocket baseurl for testnet is "wss://stream.binancefuture.com"

테스트를 위한, RESTful API 호출시 baseUrl : https://testnet.binancefuture.com
실제 들어가보니, 나 100,000 USDT 있더라. 진짜면 좋겠다.

* 리얼API baseUrl : https://fapi.binance.com
```


### 거래API

> 현물 거래API호출과 동일하게, Hash Message 암호문자열로 주고받는다. <br/>
> 그러므로, 현물호출방식을 참고해 작성하면된다. <br/>

```bash
# SIGNED Endpoint Examples for POST /fapi/v1/order
# (HMAC SHA256)

$ curl -H "X-MBX-APIKEY: dbefbc809e3e83c283a984c3a1459732ea7db1360ca80c5c2c8867408d28cc83" -X POST 'https://fapi/binance.com/fapi/v1/order?symbol=BTCUSDT&side=BUY&type=LIMIT&quantity=1&price=9000&timeInForce=GTC&recvWindow=5000&timestamp=1591702613943&signature= 3c661234138461fcc7a7d8746c6558c9842d4e10870d2ecbedf7777cad694af9'

```

```
// New Order (TRADE)
// 저배율 시장가 매매가 원칙이므로, 실질적으로 사용하는 파라메터는 

// rawParam = 
//  'symbol='+symbol+'&'
// +'side='+side+'&'
// +'type='+type+'&'
// +'quantity='+quantity+'&'
// +'recvWindow='+timingObj.recvWindow+'&'
// +'timestamp='+timingObj.timestamp;

// 정도가 있다.

// Request (parameters)
               Mandatory 
                (필수)
symbol            O    :  거래심볼(ex. BTCUSDT)
side              O    :  거래방법(BUY or SELL) (선물인데, LONG/SHORT이 아니다.)
positionSide      X    :  원웨이 모드에서는 양뱡향이 기본이다. 헷지모드인 경우, LONG / SHORT을 입력한다.
                         이거는 헷지모드일때 보내야하는 값이다.
                         (원문, Default BOTH for One-way Mode ; LONG or SHORT for Hedge Mode. It must be sent in Hedge Mode.)
type              O    :  거래타입, 지정가 or 시장가... 그외는 무시.

                          Type                              Additional mandatory parameters (추가적인 필수 값)

                          LIMIT                             timeInForce, quantity, price    (지정가, 저거 다 넣어야한다.)
                          MARKET                            quantity                        (시장가, 수량만 넣으면 된다.)
                          STOP/TAKE_PROFIT                  quantity, price, stopPrice      (스탑로스, 수량/지정가/스탑가격)
                          STOP_MARKET/TAKE_PROFIT_MARKET    stopPrice                       (스탑시장가, 인데...수량은 필수값이 아니네.)
                          TRAILING_STOP_MARKET              callbackRate                    (자동가격감지와 비슷한거 같은데... 쓰지말자. 모르겠다.)

timeInForce       X    : 주문방식(GTC, IOC, FOK)

                         가격지정주문（GTC）：
                         주문은 완전히 실행될때까지 유효 또는 수동으로 취소할 수 있습니다. 
                         GTC는 계약이 전부 지정가격에서 거래되는 것을 기다릴 수 있는 거래자에 적합하고 거래되지 않은 계약을 수시로 취소할 수 있습니다.
                         
                         일부거래주문（IOC）: 
                         주문은 지정가격 또는 더 좋은 가격으로 거래되어야하며 
                         즉시 전부 거래될수 없으면 아직 거래되지 않은 부분을 취소합니다. 
                         
                         전체거래주문（FOK）：
                         주문은 지정가격 또는 더 좋은 가격으로 거래되어야하며 
                         거래 될 수 없을 경우, 주문이 취소되고 일부분만 거래할 수 없습니다.

                         * 어차피 시장가매매라서 신경쓰지 않아도 된다. (시장가라 필수값 아니다.)

quantity           X    : 주문수량, 필수값 아니라고 하는데, 시장가 주문시 넣어야한다.

reduceOnly         X    : 리듀스온니, 마진이 증가하는 포지션 주문은 넣을 수 없다. 포지션이 종료되는 주문만 넣을 수 있다. 
                          기본값은 false 

price              X    : 매매 지정가격, 지정가 타입 주문시 사용.
newClientOrderId   X    : 클라이언트 주문 ID, 유니크한 ID로 주문한다. 이거 안보내면 알아서 생성해준다. 생성하려면 정규식룰에 맞춰야 한다. (^[\.A-Z\:/a-z0-9_-]{1,36}$)

recvWindow         X    : 이 값은 60000 (60초)를 넘을 수 없다. 
                          안넣으면 기본값 5000이 고정된다. 굳이 안넣어도 된다. 

                          해당값의 의미는 해시메시지 생성시간과 서버시간과의 차이 허용범위이다. 
                          
                          ((serverTime - timestamp) <= recvWindow )
                          
                          상식적으로 서버시간이 timestamp보다 더 빠를 수 없다.
                          또한, 서버와 메시지생성 간격이 너무 길면, 
                          시장가의 경우에는 사용자의 생각과 차이가 나는 가격에 체결될 수 있고
                          지정가는 차라리 빠르게 취소되고 재주문을 넣는게, 늦게 늘어간 대기열 주문보다 나을 수 있다.

                          이 때문에, 바이낸스에서는 가능한 5000(5초) 이하로 설정하길 권장한다.

timestamp          O    : 타임스탬프, 현재시간을 넣어주면 된다. (13자리, Javascript:Date.now();)

// Response:
{
    "clientOrderId": "testOrder",
    "cumQty": "0",
    "cumQuote": "0",
    "executedQty": "0",
    "orderId": 22542179,
    "avgPrice": "0.00000",
    "origQty": "10",
    "price": "0",
    "reduceOnly": false,
    "side": "BUY",
    "positionSide": "SHORT",
    "status": "NEW",
    "stopPrice": "9300",      // please ignore when order type is TRAILING_STOP_MARKET
    "closePosition": false,   // if Close-All
    "symbol": "BTCUSDT",
    "timeInForce": "GTC",
    "type": "TRAILING_STOP_MARKET",
    "origType": "TRAILING_STOP_MARKET",
    "activatePrice": "9020",    // activation price, only return with TRAILING_STOP_MARKET order
    "priceRate": "0.3",         // callback rate, only return with TRAILING_STOP_MARKET order
    "updateTime": 1566818724722,
    "workingType": "CONTRACT_PRICE",
    "priceProtect": false            // if conditional order trigger is protected   
}
POST /fapi/v1/order (HMAC SHA256)

Send in a new order.
```

```javascript
// 아래는 현재 적용된, 현물API Order메소드이다.
// 선물API가 구조가 비슷해서 그대로 적용이 가능할 것으로 판단된다.
(()=>{
    {
        
        //...

        /**
         * * 주문 요청
         * (param : newOrderRespType (주문응답타입) MARKET은 Default가 FULL이다.
         * @param {any} symbol (필수)심볼(암호화폐이름)
         * @param {any} side (필수)BUY/SELL
         * @param {any} type (필수)LIMIT/MARKET
         * @param {*} quantity (필수)수량
         * @param {*} price 가격
         * @param {any} timeInForce GTC/IOC/FOK
         */
        callOrder : function(symbol, side, type, quantity, price, timeInForce){
            const timingObj = orderObj.getTimingSec();
            let rawParam = '';
            let url = dealSet.baseUrl+'/api/v3/order'; //=> 선물API URL은 /fapi/v1/order

            url += (isDev ? ('/test') : ''); // 개발/운영 Url 분기처리

            if(type==='MARKET'){
                if(!(symbol && side && type && quantity)){
                    logger.error(symbol+', '+ side+', '+ type+', '+ quantity);
                    return(new Promise((resolve,reject)=>{ reject('insufficient param For MarketType')}));
                }

                rawParam = 
                'symbol='+symbol+'&'
                +'side='+side+'&'
                +'type='+type+'&'
                +'quantity='+quantity+'&'
                +'recvWindow='+timingObj.recvWindow+'&'
                +'timestamp='+timingObj.timestamp;

            }else if(type==='LIMIT'){
                if(!(symbol && side && type && quantity && price && timeInForce)){
                    logger.error(symbol+', '+ side+', '+ type+', '+ quantity +', '+ price+', '+ timeInForce);
                    return(new Promise((resolve,reject)=>{ reject('insufficient param For LIMIT')}));
                }

                rawParam = 
                'symbol='+symbol+'&'
                +'side='+side+'&'
                +'type='+type+'&'
                +'timeInForce='+timeInForce+'&'
                +'quantity='+quantity+'&'
                +'price='+price+'&'
                +'recvWindow='+timingObj.recvWindow+'&'
                +'timestamp='+timingObj.timestamp;

            }else{
                return(new Promise((resolve,reject)=>{ reject('orderType is empty')}));
            }

            
            const header = orderObj.getXhrHeader();

            const signatureStr = GenerateHMAC(dealSet.APIPkey, rawParam);
            const finalParam = rawParam + '&signature=' + signatureStr;

            logger.debug('callOrder. finalParam: '+finalParam);
            return xhrObj.xhrPost(url, finalParam, header);
        }

        // ...
    }
})();


```

### 그외API
#### position_mode

> POST /fapi/v1/positionSide/dual<br/>
> (HMAC SHA256)<br/>
> <br/>
> 모드를 변경하는 API (true:헷지모드 / false:원웨이모드) <br/>
> 헷지모드는 롱/숏 포지션 둘 다 가질 수 있으나... 그렇다구. <br/>

```json
// parameter
{
    "dualSidePosition" : "false",
    "recvWindow" : "5000",
    "timestamp" : "1617377453874"
}

// response
{
    "code" : 200,
    "msg"  : "success"
}

```

<br/>

> GET /fapi/v1/positionSide/dual <br/>
> (HMAC SHA256)<br/>
> 현재 positionMode 정보를 가져온다.<br/>

```json
// parameter
{
    "recvWindow" : "5000",
    "timestamp" : "1617377453874"
}

// response
{
    "dualSidePosition" : true // "true" : 헷지모드 / "false" : 원웨이 모드(한방향)
}

```

#### change leverage

> POST /fapi/v1/leverage <br/>
> (HMAC SHA256)<br/>
> 숏/롱 레버리지 변경, 시스템이 초기화 될경우 초기레버리지 설정은 필수다. <br/>

```json
// parameter
{
    "symbol" : "BTCUSDT",
    "leverage" : "3",      // type : int
    "recvWindow" : "5000",
    "timestamp" : "1617377453874"
}

// response
{
    "leverage": 3,
    "maxNotionalValue": "1000000",
    "symbol": "BTCUSDT"
}

```

#### change marginType

> POST /fapi/v1/marginType <br/>
> (HMAC SHA256)<br/>
> 격리/교차를 설정하는 옵션 <br/>

```json
// parameter
{
    "symbol" : "BTCUSDT",
    "marginType" : "ISOLATED",      // ISOLATED : 격리 / CROSSED : 교차
    "recvWindow" : "5000",
    "timestamp" : "1617377453874"
}

// response
{
    "code": 200,
    "msg": "success"
}

```

## 테스트 데이터
> 현물 시그널을 임의대로 발생시키는 데이터<br/>

```sql
-- Short
insert into futures_spot_trading_history values(
   '1609534422385'  -- clientOrderId VARCHAR(24)  NOT NULL,
  ,'1609534422385'  -- orderId
  ,'S'              -- tradeType     VARCHAR(2)   NOT NULL comment '거래타입(L/S)',
  ,'general'        -- descrition    VARCHAR(100) NOT NULL comment '청산여부',
  ,'59000'          -- price         FLOAT        NOT NULL,
  ,'0.025'          -- qty           FLOAT        NOT NULL,
  ,'30'             -- profit        FLOAT        NOT NULL comment '손익금액',       -- 단위 : $
  ,'1.01'           -- profitRate    FLOAT        NOT NULL comment '손익률',
  ,'1609534422385'  -- tradeTime     BIGINT       NOT NULL,
  ,'5'              -- innerAccNo    INT          NOT NULL comment '내부계좌번호',
  ,'BTCUSDT'        -- symbol        VARCHAR(10)  NOT NULL comment '거래심볼',
  
  ,'N'              -- isOrder       VARCHAR(1)   NOT NULL comment '선물거래진행여부(Y/N)',
  ,'N'              -- del           VARCHAR(1)   NOT NULL,
);

-- Long
insert into futures_spot_trading_history values(
   '1609534422380'  -- clientOrderId VARCHAR(24)  NOT NULL,
  ,'1609534422380'  -- orderId
  ,'B'              -- tradeType     VARCHAR(2)   NOT NULL comment '거래타입(B/S)',
  ,'general'        -- descrition    VARCHAR(100) NOT NULL comment '청산여부',
  ,'59000'          -- price         FLOAT        NOT NULL,
  ,'0.015'          -- qty           FLOAT        NOT NULL,
  ,'0'              -- profit        FLOAT        NOT NULL comment '손익금액',  
  ,'0'              -- profitRate    FLOAT        NOT NULL comment '손익률',
  ,'1609534422380'  -- tradeTime     BIGINT       NOT NULL,
  ,'4'              -- innerAccNo    INT          NOT NULL comment '내부계좌번호',
  ,'BTCUSDT'        -- symbol        VARCHAR(10)  NOT NULL comment '거래심볼',
  
  ,'N'              -- isOrder       VARCHAR(1)   NOT NULL comment '선물거래진행여부(Y/N)',
  ,'N'              -- del           VARCHAR(1)   NOT NULL,
);

```


## 트러블슈팅

### Code:-1102, "Mandatory parameter 'timestamp' was not sent, was empty/null, or malformed."

> parameter에 timestamp가 들어감에도 `없거나/형식이 안맞다`라는 에러가 발생하는 상황. <br/>
> 바이낸스에서 제공한 QueryString으로도 테스트 했지만, 위의 에러가 발생했다. <br/>

```javascript
// 바이낸스에서 제공한 해당 QueryString 적용시 예상에러는 -1021 INVALID_TIMESTAMP 관련에러다.
// 하지만, timestamp자체를 확인못하는 것 같다.
// timestamp 현재시간을 넣어도 동일한 에러가 발생한다.

symbol=BTCUSDT
&side=BUY
&type=LIMIT
&timeInForce=GTC
&quantity=1
&price=9000
&recvWindow=5000
&timestamp=1591702613943

```

> 현물API에서 주문시 같은 POST임에도 정상동작했기 때문에. <br/>
> 선물API 양식에 맞게 변경이 필요하다는 점을 느꼈다. <br/>
> (chromeDev / nodejs 둘 다 동일한 증상) <br/>
> <br/>
> GET방식의 HMAC암호화된 API는 정상동작한다.<br/>
> POST방식에서만 발생하는 문제.(Order가 아니더라도 POST HAMC에서 동일하게 증상이 나타났다.) <br/>
> 아래는 기술된 파라메터 <br/>
> <br/>

```javascript

callorder = function(parameters){
    // ...

    if(type==='MARKET'){
        if(!(symbol && side && type && quantity)){
            logger.error(symbol+', '+ side+', '+ type+', '+ quantity);
            return(new Promise((resolve,reject)=>{ reject('insufficient param For MarketType')}));
        }
        rawParam = 
        'symbol='+symbol+'&'
        +'side='+side+'&'
        +'type='+type+'&'
        +'quantity='+quantity+'&'
        +'recvWindow='+timingObj.recvWindow+'&'
        +'timestamp='+timingObj.timestamp;
    }

    // ...

    const header = orderObj.getXhrHeader(); //==> return {'X-MBX-APIKEY' : dealSet.APIKey}

    const signatureStr = GenerateHMAC(dealSet.APIPkey, rawParam);
    const finalParam = rawParam + '&signature=' + signatureStr;

    logger.debug('callOrder. finalParam: '+finalParam);
    return xhrObj.xhrPost(url, finalParam, header);

};

/**
 * XHR POST 호출 (formData만)
 * SecretKey가 필요한 경우가 대부분 이므로,
 * Header에 API Key 탑재
 * @param {*} url 대상 서버도메인(Url)
 * @param {*} param RequestBody객체
 * @param {json} header RequestHeader key:value형태의 json
 */
xhrObj.xhrPost = function(url,param, header){
    const ajaxObj = new Promise((resolve,reject)=>{
        const xhr = new XMLHttpRequest();
        xhr.onload = function(){
            var status = xhr.status;
            if(status===200 || status===201){
                resolve(JSON.parse(xhr.responseText));
            }else{
                try{
                    reject(JSON.parse(xhr.responseText));
                }catch(e){
                    logger.debug(xhr.responseText);
                }
            }
        }

        // Xhr 타임아웃 처리
        xhr.ontimeout = function (e) {
            reject(jsonObj.getMsgJson(timeoutCode, timeoutJson+'('+url+')('+param+')'));
        };

        xhr.open('POST', url);

        if(header){
            const keys = Object.keys(header);
            keys.forEach((key)=>{
                xhr.setRequestHeader(key,header[key]);
            });
        }

        // xhr.setRequestHeader('X-MBX-APIKEY',dealSet.APIKey);
        xhr.timeout = timeoutValue; // time in msec.
        xhr.send(param);
    });

    return ajaxObj;
},

```
<br/>

#### 확인 절차

a. 현선간의 API 설계 및 호출 룰에 차이가 있는지 확인.<br/>
>    => 룰 차이 없음, 단 한 가지 걸리는게 있었다. <br/>

```
    앤드포인트에 대한 기본정보.

    For GET endpoints, parameters must be sent as a query string.
    For POST, PUT, and DELETE endpoints, the parameters may be sent as a query string or in the request body with content type application/x-www-form-urlencoded. You may mix parameters between both the query string and request body if you wish to do so.
    Parameters may be sent in any order.
    If a parameter sent in both the query string and request body, the query string parameter will be used.

    --> 중간쯤에 query or request body로 내용을 보낼 수 있고,
        'application/x-www-form-urlencoded.' 컨텐츠 타입으로 이걸 포함하고 말이다.
```

<br/>

b. xhr.post의 정의 확인하기. <br/>
> 참고 : https://developer.mozilla.org/en-US/docs/Web/API/XMLHttpRequest/send <br/>

```javascript
// example.POST

var xhr = new XMLHttpRequest();
xhr.open("POST", '/server', true);

//Send the proper header information along with the request
xhr.setRequestHeader("Content-Type", "application/x-www-form-urlencoded");

xhr.onreadystatechange = function() { // Call a function when the state changes.
    if (this.readyState === XMLHttpRequest.DONE && this.status === 200) {
        // Request finished. Do processing here.
    }
}
xhr.send("foo=bar&lorem=ipsum");
// xhr.send(new Int8Array());
// xhr.send(document);

```
컨텐츠 타입 정의에 'application/x-www-form-urlencoded' 가 들어있다.  
그리고, queryString으로 보내고 있다.  

하...

<br/>

c. 해결.
```
바이낸스 현물/선물 서버의 filter나 intercept같은 부분에서 request body 파싱할때
Content-Type 확인하는 로직부분이 다른 것 같다.

현물서버는 content-type 정의가 없으면, default로 content-type : application/x-www-form-urlencoded
선물서버는 content-type 정의가 없으면, default가 저거는 아닌것 같다.

그래서, timestamp가 제대로 파싱안되니 계속 -1102 errorCode를 뱉지.

같은 POST 메소드로 호출하는데, 따로 동작하니가 미치겠구만...
필터부분은 같은 AA가 설계한게 아냐?
```

여튼, 아래값을 requestHeader에 추가하면 된다.  
`xhr.setRequestHeader("Content-Type", "application/x-www-form-urlencoded");`
