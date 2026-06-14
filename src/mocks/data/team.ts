import type { TeamMember } from '@/types/server'

export const mockTeamMembers: TeamMember[] = [
  {
    userId: 'usr_owner',
    role: 'admin',
    name: 'Warren Parad',
    email: 'warren@demo.catchmail.app',
    picture: 'https://ui-avatars.com/api/?name=Warren+Parad&background=cba6f7&color=1e1e2e',
  },
  {
    userId: 'usr_dev',
    role: 'admin',
    name: 'Alex Chen',
    email: 'alex@demo.catchmail.app',
    picture: 'https://ui-avatars.com/api/?name=Alex+Chen&background=89b4fa&color=1e1e2e',
  },
  {
    userId: 'usr_member',
    role: 'member',
    name: 'Sarah Kim',
    email: 'sarah@demo.catchmail.app',
    picture: 'https://ui-avatars.com/api/?name=Sarah+Kim&background=a6e3a1&color=1e1e2e',
  },
  {
    userId: 'usr_viewer',
    role: 'viewer',
    name: 'Jordan Lee',
    email: 'jordan@demo.catchmail.app',
    picture: 'https://ui-avatars.com/api/?name=Jordan+Lee&background=f9e2af&color=1e1e2e',
  },
]
