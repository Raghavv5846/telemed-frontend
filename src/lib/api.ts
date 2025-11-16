
export interface RegisterUserData {
  accessToken:string
  user: User
}
export interface ApiResponse<T> {
  data?: T;
  error?: string;
  success: boolean;
}

export interface User {
  id: string;
  phone: string;
  role: 'DOCTOR' | 'PATIENT';
  name?: string;
  dateOfBirth?: string;
  specialization?: string;
}

export interface Doctor {
  id: string;
  name: string;
  specialization?: string;
  phone?: string;
  status: boolean;
  avatarUrl?: string;
  rating?: number;
}

declare const api: any;

type NullableString = string | null | undefined;

function handleFetchResponse<T>(res: Response): Promise<ApiResponse<T>> {
  return res
    .json()
    .then((payload) => {
      if (payload && typeof payload === 'object' && ('success' in payload)) {
        return payload as ApiResponse<T>;
      }
      if (res.ok) {
        return { success: true, data: payload as T };
      } else {
        return { success: false, error: payload?.message || res.statusText || 'Request failed' };
      }
    })
    .catch((err) => {
      if (res.ok) {
        return { success: true, data: undefined } as ApiResponse<T>;
      }
      return { success: false, error: err?.message || 'Unknown error' };
    });
}

export class ApiClient {
  private baseUrl: NullableString;

  constructor(baseUrl?: NullableString) {
    this.baseUrl = baseUrl || null;
  }

  private async request<T>(path: string, opts: RequestInit = {}): Promise<ApiResponse<T>> {
    const url = this.baseUrl!.replace(/\/+$/, '') + path; 
    try {
      const res = await fetch(url, {
        headers: {
          'Content-Type': 'application/json',
          ...(opts.headers || {}),
        },
        ...opts,
      });

      return await handleFetchResponse<T>(res);
    } catch (err: any) {
      return { success: false, error: err?.message || 'Network error' };
    }
  }


  async checkUser(mobile: string, role: string): Promise<ApiResponse<{ exists: boolean; user?: User }>> {
    
    return this.request(`/send_otp`, {
      method: 'POST',
      body: JSON.stringify({ mobile,role }),
    });
  }

  async createUser(userData: Omit<User, 'id'>): Promise<ApiResponse<User>> {
    return this.request(`/auth/create`, {
      method: 'POST',
      body: JSON.stringify(userData),
    });
  }
  async registerUser(userData: Omit<User, 'id'> ,phone: string , otp: string, role: string ): Promise<ApiResponse<{ status: boolean; message: string; data: RegisterUserData}>> {
    return this.request(`/register`, {
      method: 'POST',
      body: JSON.stringify({ name: userData.name, mobile: phone, dateOfBirth: userData.dateOfBirth ,role,otp,specialization: userData?.specialization })});
  }

  async setDoctorAvailability(doctorId: string , newAvailability: boolean ): Promise<ApiResponse<{ status: boolean; message: string; data: RegisterUserData}>> {
    return this.request(`/doctors/status`, {
      method: 'POST',
      body: JSON.stringify({ doctorId, newAvailability })});
  }

  async updateProfile(userId: string, phone: string, profileData: Partial<User>): Promise<ApiResponse<User>> {
    return this.request(`/users/${encodeURIComponent(userId)}`, {
      method: 'PUT',
      body: JSON.stringify({ phone, ...profileData }),
    });
  }

  async getDoctors(): Promise<ApiResponse<Doctor[]>> {
    return this.request(`/doctors`, { method: 'GET' });
  }

  async initiateCall(doctorId: string, userId: string): Promise<ApiResponse<{ callId: string }>> {
    return this.request(`/calls`, {
      method: 'POST',
      body: JSON.stringify({ doctorId, userId }),
    });
  }

  async updateDoctorAvailability(doctorId: string, isAvailable: boolean): Promise<ApiResponse<void>> {
    return this.request(`/doctors/${encodeURIComponent(doctorId)}/availability`, {
      method: 'PATCH',
      body: JSON.stringify({ isAvailable }),
    });
  }

  async sendOTP(phone: string): Promise<ApiResponse<{ otp: string }>> {
    return this.request(`/auth/send-otp`, {
      method: 'POST',
      body: JSON.stringify({ phone }),
    });
  }

  async verifyOTP(mobile: string, otp: string, role: string): Promise<ApiResponse<{ verified: boolean }>> {
    
    return this.request(`/login`, {
      method: 'POST',
      body: JSON.stringify({ mobile, otp, role }),
    });
  }

  setBaseUrl(baseUrl?: NullableString) {
    this.baseUrl = baseUrl || null;
  }
}

export function createApiInstance(baseUrl?: string | null) {
  
  return new ApiClient(baseUrl);
}

const DEFAULT_BASE = import.meta.env.VITE_API_BACKEND_URL;
// "https://telemed-backend-rahh.onrender.com/api" ||
const apiClient = createApiInstance(DEFAULT_BASE);
export default apiClient;