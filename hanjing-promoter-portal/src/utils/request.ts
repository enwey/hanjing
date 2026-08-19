import axios from 'axios'
import { MessagePlugin } from 'tdesign-vue-next'
import router from '@/router'
import { clearPromoterAuth, getPromoterToken } from '@/utils/auth'

const service = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || '',
  timeout: 30000
})

service.interceptors.request.use(
  (config) => {
    const token = getPromoterToken()
    if (token) {
      config.headers.Authorization = `Bearer ${token}`
    }
    return config
  },
  (error) => Promise.reject(error)
)

service.interceptors.response.use(
  (response) => {
    const res = response.data
    if (res.code && res.code !== 200) {
      MessagePlugin.error(res.message || '操作失败')
      return Promise.reject(new Error(res.message || 'Error'))
    }
    return res
  },
  (error) => {
    if (error.response) {
      const status = error.response.status
      if (status === 401) {
        MessagePlugin.error(error.response.data?.message || '登录已失效，请重新登录')
        clearPromoterAuth()
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
