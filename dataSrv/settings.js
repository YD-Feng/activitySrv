var settings = {
    //redis连接地址
    redisHost: '127.0.0.1',
    //redis连接端口号
    redisPort: 6379,

    //后台接口配置
    requestConfig: {
        //IP地址
        host: '127.0.0.1',
        //端口号
        port: 80,
        paths: {
            //获取活动配置接口
            queryGroups: '/hbiInterface/onlineTreasure/queryGroups',
            //钻石增减接口
            increaseJewel: '/hbiInterface/user/increaseJewel',
            //获取用户（主播）信息接口
            getUserInfoC: '/hbiInterface/compereUser/getUserInfo4GameServer',
            //获取用户（玩家）信息接口
            getUserInfoP: '/hbiInterface/playerUser/getUserInfo4GameServer',
            //生成获奖用户接口
            queryWinner: '/hbiInterface/onlineTreasure/queryWinner'
        }
    }
};

module.exports = settings;
