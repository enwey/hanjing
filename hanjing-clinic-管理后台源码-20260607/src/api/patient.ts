import request from '@/utils/request'

export interface PatientQueryParams {
  search?: string
  page?: number
  pageSize?: number
}

export interface Patient {
  id: string | number
  name: string
  phone: string
  gender: number
  age: number
  user_nickname?: string
  user_phone?: string
  visit_count?: number
}

export interface PaginatedResult<T> {
  list: T[]
  pagination: {
    total: number
    page: number
    pageSize: number
    totalPages: number
  }
}

/**
 * 获取患者列表 (支持分页与搜索)
 */
export function getPatients(params?: PatientQueryParams) {
  return request.get<PaginatedResult<Patient>>('/api/admin/patients', { params })
}

/**
 * 获取单个患者详情
 */
export function getPatientDetail(id: string | number) {
  return request.get<Patient>(`/api/admin/patients/${id}`)
}

/**
 * 安全解密查看患者真实手机号
 */
export function decryptPatientPhone(id: string | number) {
  return request.get<{ phone: string }>(`/api/admin/patients/${id}/phone`)
}

/**
 * 管理员手动建档创建患者
 */
export function createPatient(data: Omit<Patient, 'id'>) {
  return request.post<Patient>('/api/admin/patients', data)
}
