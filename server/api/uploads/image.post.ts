export default defineEventHandler(async (event) => {
  const form = await readMultipartFormData(event)
  const file = form?.find(f => f.name === 'file')

  if (!file) {
    throw createError({
      statusCode: 400,
      statusMessage: 'No file uploaded'
    })
  }

  const baseUrl = 'https://directus.theledouxs.com'
  const token = 'g5xg68le7V-Ra5u2Dae_fmoSI3eO-weh'

  const uploadForm = new FormData()
  uploadForm.append(
    'file',
    new Blob([file.data], { type: file.type || 'application/octet-stream' }),
    file.filename || 'upload.bin'
  )

  const res = await fetch(`${baseUrl}/files`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`
    },
    body: uploadForm
  })

  const json = await res.json()

  if (!res.ok) {
    throw createError({
      statusCode: res.status,
      statusMessage: json?.errors?.[0]?.message || json?.message || 'Failed to upload image'
    })
  }

  return {
    file_id: json.data.id,
    asset_url: `/api/assets/${json.data.id}`
  }
})
