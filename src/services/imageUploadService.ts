import { doc, getDoc } from 'firebase/firestore';
import { db } from '../firebase';

export async function uploadImageToImgBB(file: File): Promise<string> {
  // 1. Fetch settings/business from Firestore to read the API key
  const settingsRef = doc(db, 'settings', 'business');
  const snap = await getDoc(settingsRef);
  
  if (!snap.exists()) {
    throw new Error('Debe configurar la información general de la empresa.');
  }
  
  const data = snap.data();
  const apiKey = data.imgbbApiKey;
  
  if (!apiKey || !apiKey.trim()) {
    throw new Error('Falta configurar la API Key de ImgBB en la configuración del negocio.');
  }

  // 2. Build FormData with the raw image
  const formData = new FormData();
  formData.append('image', file);

  // 3. Post to ImgBB
  const response = await fetch(`https://api.imgbb.com/1/upload?key=${apiKey.trim()}`, {
    method: 'POST',
    body: formData,
  });

  if (!response.ok) {
    const errText = await response.text();
    console.error('ImgBB upload response error:', errText);
    throw new Error('Error al subir la imagen a ImgBB. Verifique la API Key y la conexión.');
  }

  const result = await response.json();
  if (!result.success || !result.data?.url) {
    throw new Error('ImgBB no devolvió una URL de imagen válida.');
  }

  return result.data.url;
}
