import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const filePath = path.join(__dirname, '../src/pages/MerchPage.jsx');
let content = fs.readFileSync(filePath, 'utf8');

// The photo handler section to replace
const targetStart = "  // ─── Photo Handlers ────────────────────────────────────────────────────────";
const targetEnd = `  const handleDeletePhoto = async (product) => {
    const canManage = isChef || (managerClub && product.club === managerClub);
    if (!canManage) return toast.error('Доступ запрещен');
    if (!window.confirm('Удалить фото товара?')) return;
    try {
      await updateDoc(doc(db, 'merch_products', product.id), { imageUrl: null, updatedAt: serverTimestamp() });
      toast.success('Фото удалено');
    } catch (err) {
      console.error(err);
      toast.error('Ошибка удаления фото');
    }
  };`;

// We'll normalize line endings (CRLF -> LF) to prevent matching failures
const normalizedContent = content.replace(/\r\n/g, '\n');
const normalizedTargetStart = targetStart.replace(/\r\n/g, '\n');
const normalizedTargetEnd = targetEnd.replace(/\r\n/g, '\n');

const startIdx = normalizedContent.indexOf(normalizedTargetStart);
if (startIdx === -1) {
  console.error("Target start not found!");
  process.exit(1);
}

const endIdx = normalizedContent.indexOf(normalizedTargetEnd);
if (endIdx === -1) {
  console.error("Target end not found!");
  process.exit(1);
}

const replacement = `  // ─── Photo Handlers ────────────────────────────────────────────────────────
  // Compresses image via Canvas API → base64 JPEG → stored directly in Firestore
  // No external services, no Firebase Storage, no API keys required.

  const handlePhotoSelect = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) return toast.error('Выберите файл изображения');
    if (file.size > 15 * 1024 * 1024) return toast.error('Размер файла не должен превышать 15 МБ');
    setPhotoFile(file);
    setPhotoPreview(URL.createObjectURL(file));
  };

  const compressImageToBase64 = (file) => new Promise((resolve, reject) => {
    const img = new Image();
    const objectUrl = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(objectUrl);
      const MAX_SIZE = 800; // px — keeps final size ~100-220 KB
      let { width, height } = img;
      if (width > MAX_SIZE || height > MAX_SIZE) {
        if (width > height) { height = Math.round((height * MAX_SIZE) / width); width = MAX_SIZE; }
        else { width = Math.round((width * MAX_SIZE) / height); height = MAX_SIZE; }
      }
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      canvas.getContext('2d').drawImage(img, 0, 0, width, height);
      resolve(canvas.toDataURL('image/jpeg', 0.82));
    };
    img.onerror = () => reject(new Error('Не удалось прочитать изображение'));
    img.src = objectUrl;
  });

  const handleUploadPhoto = async () => {
    if (!photoFile) return null;
    setPhotoUploading(true);
    setPhotoUploadProgress(30);
    try {
      const base64 = await compressImageToBase64(photoFile);
      setPhotoUploadProgress(100);
      setPhotoUploading(false);
      return base64;
    } catch (err) {
      setPhotoUploading(false);
      throw new Error('Не удалось обработать изображение: ' + err.message);
    }
  };

  const handleDeletePhoto = async (product) => {
    const canManage = isChef || (managerClub && product.club === managerClub);
    if (!canManage) return toast.error('Доступ запрещен');
    if (!window.confirm('Удалить фото товара?')) return;
    try {
      await updateDoc(doc(db, 'merch_products', product.id), { imageUrl: null, updatedAt: serverTimestamp() });
      toast.success('Фото удалено');
    } catch (err) {
      console.error(err);
      toast.error('Ошибка удаления фото');
    }
  };`;

// Replace from startIdx to endIdx + targetEnd.length
const newContent = normalizedContent.substring(0, startIdx) + replacement + normalizedContent.substring(endIdx + normalizedTargetEnd.length);
fs.writeFileSync(filePath, newContent, 'utf8');
console.log("File updated successfully!");
