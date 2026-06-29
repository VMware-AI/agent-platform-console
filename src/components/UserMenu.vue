<script setup lang="ts">
import { useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { useLocaleStore } from '@/stores/locale'
import AppDropdown from './AppDropdown.vue'
import AboutDialog from './AboutDialog.vue'
import ChangePasswordModal from './ChangePasswordModal.vue'
import { ref } from 'vue'
import './icons'

const auth = useAuthStore()
const locale = useLocaleStore()
const router = useRouter()

const aboutOpen = ref(false)
const changePasswordOpen = ref(false)

function openAbout() {
  aboutOpen.value = true
}
function closeAbout() {
  aboutOpen.value = false
}
function openChangePassword(close: () => void) {
  close()
  changePasswordOpen.value = true
}
function closeChangePassword() {
  changePasswordOpen.value = false
}

async function onLogout() {
  // Await the store action so user/role/mustChangePassword are cleared and
  // `isAuthenticated` flips to false BEFORE we navigate. Without the await,
  // router.push fires while the auth state still shows the user as signed in,
  // the guard's "authenticated user visiting /login → redirect to overview"
  // branch bounces them back, and the user has to click Logout twice.
  await auth.logout()
  router.push({ name: 'login' })
}

async function goProfile(close: () => void) {
  // Close the dropdown first, then navigate. Awaiting navigation isn't
  // needed — the route guard just checks isAuthenticated.
  close()
  router.push({ name: 'profile' })
}
</script>

<template>
  <AppDropdown align="end">
    <template #trigger>
      <cds-button action="ghost" type="button">
        <cds-icon shape="user"></cds-icon>
        <span class="name">{{ auth.user?.displayName }}</span>
        <cds-icon shape="angle" direction="down" size="sm"></cds-icon>
      </cds-button>
    </template>

    <template #default="{ close }">
      <div class="who">
        <div class="who-name">{{ auth.user?.displayName }}</div>
        <div class="who-email">{{ auth.user?.email }}</div>
      </div>
      <cds-divider cds-card-remove-margin></cds-divider>
      <button type="button" class="opt" @click="goProfile(close)">
        <cds-icon shape="user" size="sm"></cds-icon>
        <span>{{ locale.t('user.profile') }}</span>
      </button>
      <button type="button" class="opt" @click="openChangePassword(close)">
        <cds-icon shape="lock" size="sm"></cds-icon>
        <span>{{ locale.t('profile.action.changePassword') }}</span>
      </button>
      <button type="button" class="opt" @click="openAbout()">
        <cds-icon shape="info-circle" size="sm"></cds-icon>
        <span>{{ locale.t('about.menu') }}</span>
      </button>
      <cds-divider cds-card-remove-margin></cds-divider>
      <button type="button" class="opt danger" @click="onLogout">
        <cds-icon shape="logout" size="sm"></cds-icon>
        <span>{{ locale.t('user.logout') }}</span>
      </button>
    </template>
  </AppDropdown>

  <AboutDialog :open="aboutOpen" @close="closeAbout" />
  <ChangePasswordModal
    v-if="changePasswordOpen"
    closable
    @close="closeChangePassword"
  />
</template>

<style scoped>
.who {
  padding: 10px 14px 12px;
  min-width: 220px;
}
.who-name {
  font-weight: 600;
  margin-bottom: 2px;
}
.who-email {
  color: var(--cds-alias-typography-color-300, #6b6b6b);
  font-size: 12px;
}
.opt {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 14px;
  background: none;
  border: 0;
  font: inherit;
  color: inherit;
  text-align: left;
  cursor: pointer;
  width: 100%;
}
.opt:hover { background: var(--cds-alias-object-app-background, #f4f4f4); }
.opt.danger { color: #c92100; }
</style>
