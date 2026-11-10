// Публичная web-конфигурация. Никогда не добавляйте private_key/service-account JSON.
window.NOBAI_CONFIG = {
  // 'peerjs' сохраняет существующий транспорт. Для Firebase: 'firebase' + firebaseConfig.
  transport: 'peerjs',
  firebaseConfig: null,
  // При наличии своего TURN задайте iceServers здесь. Постоянные секреты не публикуйте.
  peerOptions: {}
};
