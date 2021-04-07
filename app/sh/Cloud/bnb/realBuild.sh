# making Timezone symbolLink
homepath='/home/{yourAccout}'
symbolpath='bnb'
dockername='bnb_fu_real'

ln -sf /usr/share/zoneinfo/Asia/Seoul $homepath/etc/localtime
rm -rf $homepath/tmp/autobit-fu

cd $homepath/workspace/realWorkspace/$symbolpath/bitcoinAuto_futures/app/
mkdir $homepath/tmp/autobit-fu

cp -r * $homepath/tmp/autobit-fu
cd $homepath/tmp/autobit-fu

#운영전용 명령어 (only Realmode)
mv $homepath/tmp/autobit-fu/Dockerfiles/Cloud/$symbolpath/Dockerfile_real $homepath/tmp/autobit-fu/Dockerfile
cp $homepath/workspace/realWorkspace/$symbolpath/bitcoinAuto_futures/app/Dockerfiles/Cloud/$symbolpath/._env $homepath/workspace/realWorkspace/$symbolpath/bitcoinAuto_futures/app/.env

timestamp=`date +%Y%m%d%H%M`
listenport=8102:8102

# build and Timezon Linking
# -v host경로 docker경로
# -v 경로는 절대경로를 삽입해야함.
docker build --tag auto/$dockername:$timestamp .
docker create --name $dockername -p $listenport \
 -v $homepath/log/nodejs/:$homepath/log/nodejs/ \
 -v $homepath/etc/localtime:/etc/localtime:ro \
 -v $homepath/workspace/realWorkspace/$symbolpath/bitcoinAuto_futures/app:$homepath/usr/tmp/nodejs \
-e TZ=Asia/Seoul \
auto/$dockername:$timestamp 

echo 'docker build complete.'




