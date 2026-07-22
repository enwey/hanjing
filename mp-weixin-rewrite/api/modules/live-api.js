const { request } = require('../request');

function getLiveRooms() {
  return request({ url: '/live/rooms', method: 'GET', failMessage: '加载直播列表失败' });
}

function getLiveRoomDetail(roomId) {
  return request({ url: '/live/rooms/' + roomId, method: 'GET', failMessage: '加载直播详情失败' });
}

module.exports = {
  getLiveRooms,
  getLiveRoomDetail
};
