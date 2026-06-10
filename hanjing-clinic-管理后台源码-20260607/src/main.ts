import { createApp } from 'vue'
import { createPinia } from 'pinia'
import TDesign from 'tdesign-vue-next'
import 'tdesign-vue-next/es/style/index.css'
import App from './App.vue'
import router from './router'
import './styles/global.css'
import { resizable } from './directives/resizable'

const app = createApp(App)
app.use(createPinia())
app.use(TDesign)
app.use(router)
app.directive('resizable', resizable)
app.mount('#app')
