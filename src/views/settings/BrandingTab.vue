<script setup lang="ts">
/**
 * Branding settings tab — content moved from [BrandingSettingsView.vue](../BrandingSettingsView.vue)
 * into the SettingsView double-tab container. The page header and `<TabStrip>`
 * are owned by the parent; this tab only renders the brand config form + live
 * preview.
 *
 * `onUnmounted` resets the init/form-touched flags so a tab switch triggers a
 * clean re-initialization on the next mount (preserves the source page's
 * "switch menu and come back = empty form" fix).
 */
import { ref, computed, watch, onMounted, onUnmounted } from 'vue'
import { useQuery, useMutation } from '@vue/apollo-composable'
import { useLocaleStore } from '@/stores/locale'
import { useToast } from '@/composables/useToast'
import { gql } from '@apollo/client/core'
import { useBrandStore } from '@/stores/brand'

const locale = useLocaleStore()
const toast = useToast()
const brandStore = useBrandStore()
const REF = 'default'

const Q = gql`query Brand($ref:String!){platformBrandConfig(ref:$ref){platformName shortName browserTitle loginSubtitle logoUrl faviconUrl loginBgUrl primaryColor loginBgOverlayEnabled loginBgOverlayOpacity loginCardPosition copyrightText supportText supportUrl}}`
const M = gql`mutation UpdateBrand($input:UpdatePlatformBrandInput!){updatePlatformBrandConfig(input:$input){ref __typename platformName shortName browserTitle loginSubtitle logoUrl faviconUrl loginBgUrl primaryColor loginBgOverlayEnabled loginBgOverlayOpacity loginCardPosition copyrightText supportText supportUrl}}`

// ── editable form state ──
const platformName = ref(''); const shortName = ref(''); const browserTitle = ref('')
const loginSubtitle = ref(''); const logoUrl = ref(''); const faviconUrl = ref('')
const loginBgUrl = ref(''); const primaryColor = ref('#0063B1')
const overlayEnabled = ref(false); const overlayOpacity = ref(40); const loginCardPosition = ref('center')
const copyrightText = ref(''); const supportText = ref(''); const supportUrl = ref('')

// User editing tracking: prevents query results from overwriting user input
const userEdited = ref(false)
const formTouched = ref(false)

function markTouched() { formTouched.value = true; userEdited.value = true }

function initFormFromServer(b: Record<string, unknown> | null | undefined) {
  if (!b) return
  platformName.value = (b.platformName as string) || ''
  shortName.value = (b.shortName as string) || ''
  browserTitle.value = (b.browserTitle as string) || ''
  loginSubtitle.value = (b.loginSubtitle as string) || ''
  logoUrl.value = (b.logoUrl as string) || ''
  faviconUrl.value = (b.faviconUrl as string) || ''
  loginBgUrl.value = (b.loginBgUrl as string) || ''
  primaryColor.value = (b.primaryColor as string) || '#0063B1'
  overlayEnabled.value = (b.loginBgOverlayEnabled as boolean) || false
  overlayOpacity.value = (b.loginBgOverlayOpacity as number) ?? 40
  loginCardPosition.value = (b.loginCardPosition as string) || 'center'
  copyrightText.value = (b.copyrightText as string) || ''
  supportText.value = (b.supportText as string) || ''
  supportUrl.value = (b.supportUrl as string) || ''
  userEdited.value = false
  formTouched.value = false
}

const { result, refetch, onResult } = useQuery(Q, { ref: REF }, () => ({ fetchPolicy: 'network-only' }))

// Watch result for initial load and after-save sync
let initDone = false
onResult(({ data }) => {
  const b = data?.platformBrandConfig
  if (!b) return
  if (!initDone) {
    initFormFromServer(b)
    initDone = true
  } else if (!userEdited.value) {
    initFormFromServer(b)
  }
  // Pass data directly to bypass cache propagation delay between separate useQuery instances
  brandStore.apply(b as Record<string, unknown>)
})

// CRITICAL: Watch result.value directly because onResult does NOT fire for
// cached values when the component re-mounts (Apollo returns cached synchronously,
// bypassing the onResult callback). This is the root cause of "switch menu and
// come back = empty form".
watch(result, (b) => {
  if (!b?.platformBrandConfig) return
  initFormFromServer(b.platformBrandConfig as Record<string, unknown>)
  brandStore.apply(b.platformBrandConfig as Record<string, unknown>)
}, { immediate: true })

// Force refetch on every mount to bypass stale cache
onMounted(() => {
  void refetch()
})

const { mutate: doSave, loading: saving, onDone: onSaveDone } = useMutation(M)

onSaveDone(async () => {
  // Push saved settings directly into the store first (immediate shell/login update),
  // then refetch to reconcile with the server.
  const saved = result.value?.platformBrandConfig
  if (saved) {
    brandStore.setSettings(saved as Record<string, unknown>)
  }
  await refetch()
  // Force brand store to re-read from cache now that the mutation+refetch have updated it
  await brandStore.refetch()
})

const isDirty = computed(() => formTouched.value)

async function onSave() {
  if (saving.value) return
  try {
    await doSave({ input: { ref: REF, platformName: platformName.value||null, shortName: shortName.value||null, browserTitle: browserTitle.value||null, loginSubtitle: loginSubtitle.value||null, logoUrl: logoUrl.value||null, faviconUrl: faviconUrl.value||null, loginBgUrl: loginBgUrl.value||null, primaryColor: primaryColor.value||null, loginBgOverlayEnabled: overlayEnabled.value, loginBgOverlayOpacity: overlayOpacity.value, loginCardPosition: loginCardPosition.value||null, copyrightText: copyrightText.value||null, supportText: supportText.value||null, supportUrl: supportUrl.value||null } })
    toast.success(locale.t('branding.saved'))
  } catch { toast.error(locale.t('branding.error')) }
}

// Reset on unmount so re-mount gets fresh init
onUnmounted(() => { initDone = false; userEdited.value = false; formTouched.value = false })

function onFile(e: Event, key: 'logoUrl'|'faviconUrl'|'loginBgUrl') {
  const f = (e.target as HTMLInputElement).files?.[0]; if (!f) return
  const MAX = key==='faviconUrl'?512*1024:key==='logoUrl'?2*1024*1024:5*1024*1024
  if (f.size > MAX) { toast.error(locale.t('branding.tooLarge').replace('{n}',String(MAX/1024/1024)+'MB')); return }
  const r = new FileReader(); r.onload = () => { (key==='logoUrl'?logoUrl:key==='faviconUrl'?faviconUrl:loginBgUrl).value = r.result as string }; r.readAsDataURL(f)
}

const previewStyle = computed(() => ({ '--brand-primary': primaryColor.value || '#0063B1', '--overlay-opacity': overlayEnabled.value ? overlayOpacity.value/100 : 0 }))
</script>

<template>
  <section class="branding-tab" :style="previewStyle">
    <div class="br-layout">
      <div class="br-config">
        <cds-card class="card"><div class="cp"><h2>{{ locale.t('branding.basicInfo') }}</h2>
          <label class="fld"><span>{{ locale.t('branding.platformName') }}*</span><input class="fctl" v-model="platformName" maxlength="50" autocomplete="off" @input="markTouched"/></label>
          <label class="fld"><span>{{ locale.t('branding.shortName') }}</span><input class="fctl" v-model="shortName" maxlength="20" autocomplete="off" @input="markTouched"/></label>
          <label class="fld"><span>{{ locale.t('branding.browserTitle') }}</span><input class="fctl" v-model="browserTitle" autocomplete="off" @input="markTouched"/></label>
          <label class="fld"><span>{{ locale.t('branding.loginSubtitle') }}</span><input class="fctl" v-model="loginSubtitle" maxlength="100" autocomplete="off" @input="markTouched"/></label>
        </div></cds-card>

        <cds-card class="card"><div class="cp"><h2>{{ locale.t('branding.theme') }}</h2>
          <div class="fld-row">
            <label class="fld"><span>{{ locale.t('branding.primaryColor') }}</span><input type="color" v-model="primaryColor" style="width:48px;height:32px;border:1px solid #e4e7ec;border-radius:4px;cursor:pointer"/><span class="mu">{{ primaryColor }}</span></label>
            <label class="fld"><span>{{ locale.t('branding.overlay') }}</span><input type="range" min="0" max="80" v-model.number="overlayOpacity" style="width:120px"/><span class="mu">{{ overlayOpacity }}%</span></label>
          </div>
          <label class="fld fld-inline"><input type="checkbox" v-model="overlayEnabled" :aria-label="locale.t('branding.overlayEnable')"/><span>{{ locale.t('branding.overlayEnable') }}</span></label>
          <label class="fld"><span>{{ locale.t('branding.cardPos') }}</span><select v-model="loginCardPosition" class="fctl" :aria-label="locale.t('branding.cardPos')"><option value="center">居中</option><option value="left">左侧</option><option value="right">右侧</option></select></label>
        </div></cds-card>

        <cds-card class="card"><div class="cp"><h2>{{ locale.t('branding.assets') }}</h2>
          <div class="asset-row">
            <div class="asset-box"><span class="fl">{{ locale.t('branding.logo') }}</span><div class="pv"><img v-if="logoUrl" :src="logoUrl" class="pv-logo"/><span v-else class="mu">128x128 SVG/PNG ≤2MB</span></div><div class="asset-acts"><cds-button size="sm" action="outline" @click="($refs.logoInput as HTMLInputElement)?.click()">{{ logoUrl?'替换':'选择' }}</cds-button><cds-button v-if="logoUrl" size="sm" action="outline" @click="logoUrl=''">删除</cds-button></div><input ref="logoInput" type="file" accept="image/*" hidden @change="(e:Event)=>onFile(e,'logoUrl')"/></div>
            <div class="asset-box"><span class="fl">{{ locale.t('branding.favicon') }}</span><div class="pv"><img v-if="faviconUrl" :src="faviconUrl" class="pv-icon"/><span v-else class="mu">32x32 ICO/PNG ≤512KB</span></div><div class="asset-acts"><cds-button size="sm" action="outline" @click="($refs.favInput as HTMLInputElement)?.click()">{{ faviconUrl?'替换':'选择' }}</cds-button><cds-button v-if="faviconUrl" size="sm" action="outline" @click="faviconUrl=''">删除</cds-button></div><input ref="favInput" type="file" accept="image/*" hidden @change="(e:Event)=>onFile(e,'faviconUrl')"/></div>
          </div>
          <div class="asset-box"><span class="fl">{{ locale.t('branding.loginBg') }}</span><div class="pv"><img v-if="loginBgUrl" :src="loginBgUrl" class="pv-bg"/><span v-else class="mu">1920x1080 JPG/PNG ≤5MB</span></div><div class="asset-acts"><cds-button size="sm" action="outline" @click="($refs.bgInput as HTMLInputElement)?.click()">{{ loginBgUrl?'替换':'选择' }}</cds-button><cds-button v-if="loginBgUrl" size="sm" action="outline" @click="loginBgUrl=''">删除</cds-button></div><input ref="bgInput" type="file" accept="image/*" hidden @change="(e:Event)=>onFile(e,'loginBgUrl')"/></div>
        </div></cds-card>

        <cds-card class="card"><div class="cp"><h2>{{ locale.t('branding.footer') }}</h2>
          <label class="fld"><span>{{ locale.t('branding.copyright') }}</span><input class="fctl" v-model="copyrightText" autocomplete="off" placeholder="© 2026" @input="markTouched"/></label>
          <label class="fld"><span>{{ locale.t('branding.support') }}</span><input class="fctl" v-model="supportText" autocomplete="off" @input="markTouched"/></label>
          <label class="fld"><span>{{ locale.t('branding.supportUrl') }}</span><input class="fctl" v-model="supportUrl" autocomplete="off" @input="markTouched"/></label>
        </div></cds-card>
      </div>

      <div class="br-preview">
        <cds-card class="card"><div class="cp"><h2>{{ locale.t('branding.preview') }}</h2>
          <div class="pr-login" :style="loginBgUrl?{backgroundImage:`url(${loginBgUrl})`,backgroundSize:'cover',backgroundPosition:'center'}:{}">
            <div v-if="overlayEnabled" class="pr-overlay" :style="{background:`rgba(0,0,0,${overlayOpacity/100})`}"></div>
            <div class="pr-card" :style="{alignSelf:loginCardPosition==='right'?'flex-end':loginCardPosition==='left'?'flex-start':'center'}">
              <div class="pr-logo"><img v-if="logoUrl" :src="logoUrl" style="max-width:48px;max-height:48px"/><div v-else style="width:40px;height:40px;background:var(--brand-primary);border-radius:8px;display:flex;align-items:center;justify-content:center;color:#fff;font-size:20px;font-weight:700">AI</div></div>
              <strong class="pr-name">{{ platformName||locale.t('app.brand') }}</strong>
              <p v-if="loginSubtitle" class="pr-sub">{{ loginSubtitle }}</p>
              <input class="pr-email" disabled placeholder="admin@platform.local" style="width:100%;padding:6px 8px;border:1px solid #d0d5dd;border-radius:4px;font-size:12px;box-sizing:border-box;margin-top:4px"/>
              <input type="password" disabled value="password" style="width:100%;padding:6px 8px;border:1px solid #d0d5dd;border-radius:4px;font-size:12px;box-sizing:border-box"/>
              <button disabled :style="{background:primaryColor,border:'none',color:'#fff',padding:'8px',borderRadius:'4px',fontSize:'13px',marginTop:'4px',cursor:'pointer'}">登录</button>
              <small v-if="copyrightText" class="pr-ft">{{ copyrightText }}</small>
            </div>
          </div>
        </div></cds-card>
      </div>
    </div>

    <div class="br-footer">
      <cds-button status="primary" @click="onSave" :disabled="saving" :loading="saving">{{ locale.t('branding.save') }}</cds-button>
      <span v-if="isDirty" class="dirty-badge">{{ locale.t('branding.unsaved') }}</span>
    </div>
  </section>
</template>

<style scoped>
.branding-tab{padding:20px 24px 32px;color:var(--cds-alias-object-app-foreground,#1d2939);max-width:100%;display:flex;flex-direction:column;gap:20px}
/* 三列等宽网格铺满整页:config(4 卡 2×2)占左两列,preview 占右一列;
   让 4 张 config 与单张 preview 在视觉上"等高对齐",每列宽度由浏览器分摊。 */
.br-layout{display:grid;grid-template-columns:1fr 1fr 1fr;gap:20px;align-items:start}
.br-config{display:grid;grid-template-columns:1fr 1fr;gap:16px;min-width:0;align-content:start;grid-column:span 2}
.br-preview{display:grid;grid-template-columns:1fr;gap:16px;min-width:0;align-content:start}
.br-footer{display:flex;align-items:center;justify-content:flex-start;gap:8px;padding-top:16px;border-top:1px solid var(--cds-alias-object-border-color,#e4e7ec);margin-top:8px}
.dirty-badge{font-size:11px;color:#f79009;font-weight:600}
.card{overflow:hidden}.cp{padding:18px;display:flex;flex-direction:column;gap:12px}.cp h2{margin:0;font-size:14px;font-weight:600}
.fld{display:flex;flex-direction:column;gap:4px;font-size:12px;color:#667085}.fld-row{display:flex;gap:24px;flex-wrap:wrap}.fld-inline{flex-direction:row;align-items:center;gap:8px}
.fctl{display:block;width:100%;min-height:36px;padding:6px 4px;color:var(--cds-alias-object-app-foreground,#1d2939);background:transparent;border:0;border-bottom:1px solid var(--cds-alias-object-border-color,#d0d5dd);outline:none;pointer-events:auto;cursor:text;font:inherit;font-size:13px;box-sizing:border-box}
.fctl:focus{border-bottom-width:2px;border-bottom-color:var(--cds-alias-object-interaction-color,#0072a3)}
.asset-box{border:1px dashed #d0d5dd;border-radius:8px;padding:12px;background:#f8fafc;display:flex;flex-direction:column;gap:8px}.asset-row{display:grid;grid-template-columns:1fr 1fr;gap:12px}
.asset-acts{display:flex;gap:8px}.fl{font-size:12px;font-weight:600;color:#1d2939}
.pv{min-height:40px;display:flex;align-items:center;gap:8px}.pv-logo{max-height:48px}.pv-icon{max-height:32px}.pv-bg{max-width:100%;max-height:120px;border-radius:4px}
.pr-login{position:relative;border-radius:8px;overflow:hidden;background:#f0f2f5;min-height:280px;display:flex;flex-direction:column;align-items:stretch;justify-content:center;width:100%;padding:24px}
.pr-overlay{position:absolute;inset:0;z-index:0;pointer-events:none}
.pr-card{position:relative;z-index:1;background:#fff;border-radius:8px;padding:20px;width:min(100%,320px);box-shadow:0 4px 16px rgba(0,0,0,.1);display:flex;flex-direction:column;gap:6px}
.pr-logo{display:flex;justify-content:center;margin-bottom:4px}.pr-name{text-align:center;font-size:16px}
.pr-sub{font-size:11px;color:#667085;text-align:center;margin:0}.pr-ft{font-size:10px;color:#98a2b3;text-align:center;margin-top:4px}
.mu{color:#667085;font-size:12px}
@media(max-width:1023px){.br-layout{grid-template-columns:1fr}.br-config{grid-template-columns:1fr 1fr}}
@media(max-width:767px){.branding-tab{padding:12px}.br-layout{grid-template-columns:1fr}.br-config{grid-template-columns:1fr}.asset-row{grid-template-columns:1fr}}
</style>
