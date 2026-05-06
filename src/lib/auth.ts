import { LoginClient } from '@authress/login'

export const loginClient = new LoginClient({
  authressApiUrl: import.meta.env.VITE_AUTHRESS_LOGIN_URL as string,
  applicationId: import.meta.env.VITE_AUTHRESS_APPLICATION_ID as string,
})
