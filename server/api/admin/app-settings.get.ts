export default defineEventHandler(async () => {
  const baseUrl = 'http://ledouxvps-directus-269351-187-77-194-11.traefik.me'
  const token = 'g5xg68le7V-Ra5u2Dae_fmoSI3eO-weh'

  const res = await fetch(
    `${baseUrl}/items/app_settings?limit=1&fields=*`,
    {
      headers: {
        Authorization: `Bearer ${token}`
      }
    }
  )

  const text = await res.text()

  return {
    status: res.status,
    ok: res.ok,
    body: text
  }
})
