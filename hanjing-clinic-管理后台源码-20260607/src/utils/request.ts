import axios from 'axios'
import { MessagePlugin } from 'tdesign-vue-next'
import router from '@/router'

const service = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || 'http://localhost:5005',
  timeout: 30000
})

// Request interceptor
service.interceptors.request.use(
  config => {
    const token = localStorage.getItem('auth_token')
    if (token) {
      config.headers['Authorization'] = `Bearer ${token}`
    }
    return config
  },
  error => {
    return Promise.reject(error)
  }
)

// Response interceptor
service.interceptors.response.use(
  response => {
    const res = response.data
    if (res.code && res.code !== 200) {
      MessagePlugin.error(res.message || '操作失败')
      return Promise.reject(new Error(res.message || 'Error'))
    }
    return res
  },
  error => {
    if (error.response) {
      const status = error.response.status
      if (status === 401 || status === 403) {
        MessagePlugin.error(error.response.data?.message || '登录过期，请重新登录')
        localStorage.removeItem('auth_token')
        router.push('/login')
      } else {
        MessagePlugin.error(error.response.data?.message || '系统繁忙，请稍后再试')
      }
    } else {
      MessagePlugin.error('无法连接到服务器，请检查后端服务是否启动')
    }
    return Promise.reject(error)
  }
)

export default service
