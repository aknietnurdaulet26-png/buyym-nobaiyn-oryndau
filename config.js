// Публичная web-конфигурация. Никогда не добавляйте private_key/service-account JSON.
window.NOBAI_CONFIG = {
  // 'peerjs' сохраняет существующий транспорт. Для Firebase: 'firebase' + firebaseConfig.
  transport: 'firebase',
  // Web App Nobai LAB. Keep PeerJS until the Database Rules are installed and the live room is tested.
  firebaseConfig: {
    apiKey: 'AIzaSyBKAy26YksqhZZu9_OWEtfFsdAe_lelXv0',
    authDomain: 'buyym-nobaiyn-oryndau.firebaseapp.com',
    databaseURL: 'https://buyym-nobaiyn-oryndau-default-rtdb.asia-southeast1.firebasedatabase.app',
    projectId: 'buyym-nobaiyn-oryndau',
    appId: '1:590366772513:web:b4cfa0ce3318d6d7cf4260'
  },
  // При наличии своего TURN задайте iceServers здесь. Постоянные секреты не публикуйте.
  peerOptions: {}
};
