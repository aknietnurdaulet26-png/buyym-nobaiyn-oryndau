// Публичная web-конфигурация. Никогда не добавляйте private_key/service-account JSON.
window.NOBAI_CONFIG = {
  // 'peerjs' сохраняет существующий транспорт. Для Firebase: 'firebase' + firebaseConfig.
  transport: 'peerjs',
  // Replace BOTH placeholders with values from Project settings → Your apps.
  // Keep PeerJS until the real Web App values and Database Rules are installed.
  firebaseConfig: {
    apiKey: 'FIREBASE_WEB_API_KEY',
    authDomain: 'buyym-nobaiyn-oryndau.firebaseapp.com',
    databaseURL: 'https://buyym-nobaiyn-oryndau-default-rtdb.asia-southeast1.firebasedatabase.app',
    projectId: 'buyym-nobaiyn-oryndau',
    appId: 'FIREBASE_WEB_APP_ID'
  },
  // При наличии своего TURN задайте iceServers здесь. Постоянные секреты не публикуйте.
  peerOptions: {}
};
