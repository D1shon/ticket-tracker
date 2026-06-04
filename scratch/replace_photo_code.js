import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const filePath = path.join(__dirname, '../src/pages/MerchPage.jsx');
let content = fs.readFileSync(filePath, 'utf8');

// Normalizing CRLF
content = content.replace(/\r\n/g, '\n');

// 1. Let's find the handlePhotoSelect / compressImageToBase64 / handleUploadPhoto section
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

const startIdx = content.indexOf(targetStart);
const endIdx = content.indexOf(targetEnd);

if (startIdx === -1 || endIdx === -1) {
  console.error("Target not found!");
  process.exit(1);
}

// 2. We will redefine the photo handlers to compress the image instantly on selection.
// We'll also store the compressed base64 in a state variable `photoBase64`.
// We will replace this entire section.

const replacement = `  // ─── Photo Handlers ────────────────────────────────────────────────────────
  // Оптимизировано: сжатие происходит на клиенте мгновенно при выборе файла.
  // Это исключает задержки при сохранении товара.
  const [photoBase64, setPhotoBase64] = useState(null);

  const compressImageToBase64 = (file) => new Promise((resolve, reject) => {
    const img = new Image();
    const objectUrl = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(objectUrl);
      const MAX_SIZE = 480; // 480px идеальный размер для превью в списке и карточке продажи
      let { width, height } = img;
      if (width > MAX_SIZE || height > MAX_SIZE) {
        if (width > height) {
          height = Math.round((height * MAX_SIZE) / width);
          width = MAX_SIZE;
        } else {
          width = Math.round((width * MAX_SIZE) / height);
          height = MAX_SIZE;
        }
      }
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, width, height);
      // Качество 0.65 дает супер-легкий файл (~15–35 KB)
      resolve(canvas.toDataURL('image/jpeg', 0.65));
    };
    img.onerror = () => reject(new Error('Не удалось прочитать изображение'));
    img.src = objectUrl;
  });

  const handlePhotoSelect = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) return toast.error('Выберите файл изображения');
    
    setPhotoUploading(true);
    try {
      const base64 = await compressImageToBase64(file);
      setPhotoBase64(base64);
      setPhotoPreview(base64);
    } catch (err) {
      toast.error('Ошибка при обработке фото');
    } finally {
      setPhotoUploading(false);
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

// Replace photo handlers section
let updatedContent = content.substring(0, startIdx) + replacement + content.substring(endIdx + targetEnd.length);

// 3. Now let's look at handleSaveProduct. We need to save photoBase64 directly in a single write.
// Let's locate the handleSaveProduct definition.
const saveProductTargetStart = "  const handleSaveProduct = async (e) => {";
const saveProductTargetEnd = "  const handleDeleteProduct = async (id) => {";

const saveStartIdx = updatedContent.indexOf(saveProductTargetStart);
const saveEndIdx = updatedContent.indexOf(saveProductTargetEnd);

if (saveStartIdx === -1 || saveEndIdx === -1) {
  console.error("Save product section not found!");
  process.exit(1);
}

// Replace handleSaveProduct with optimized version:
const optimizedSaveProduct = `  const handleSaveProduct = async (e) => {
    e.preventDefault();
    const canManage = isChef || (managerClub && productForm.club === managerClub);
    if (!canManage) return toast.error('Доступ запрещен');
    if (!productForm.name.trim()) return toast.error('Введите название товара');
    
    const cost = isChef 
      ? (parseFloat(productForm.costPrice) || 0) 
      : (editingProduct ? (editingProduct.costPrice || 0) : 0);
    const sale = parseFloat(productForm.salePrice) || 0;
    const initialStock = parseInt(productForm.stock) || 0;
    const min = parseInt(productForm.minStock) || 0;

    const data = {
      name: productForm.name.trim(),
      club: productForm.club,
      category: productForm.category,
      costPrice: cost,
      salePrice: sale,
      stock: editingProduct ? editingProduct.stock : initialStock,
      minStock: min,
      updatedAt: serverTimestamp()
    };

    // Сохраняем фото в одну операцию
    if (photoBase64) {
      data.imageUrl = photoBase64;
    } else if (editingProduct) {
      // При редактировании оставляем старое фото, если не нажали "Убрать фото"
      data.imageUrl = photoPreview ? editingProduct.imageUrl || null : null;
    } else {
      data.imageUrl = null;
    }

    try {
      if (editingProduct) {
        await updateDoc(doc(db, 'merch_products', editingProduct.id), data);
        toast.success('Товар успешно обновлен');
      } else {
        data.createdAt = serverTimestamp();
        await addDoc(collection(db, 'merch_products'), data);
        toast.success('Товар добавлен в инвентарь');
      }

      setShowProductModal(false);
      setEditingProduct(null);
      setPhotoFile(null);
      setPhotoPreview(null);
      setPhotoBase64(null);
      setProductForm({ name: '', club: managerClub || '4YOU', category: 'Худи', costPrice: '', salePrice: '', stock: '', minStock: '5' });
    } catch (err) {
      console.error(err);
      toast.error('Ошибка сохранения товара');
    }
  };
`;

updatedContent = updatedContent.substring(0, saveStartIdx) + optimizedSaveProduct + updatedContent.substring(saveEndIdx);

// Let's also make sure that when editing product is opened, we reset photoBase64
// Search for "setEditingProduct(p);" to find where we prepare the modal
// We already have:
// setEditingProduct(p);
// setPhotoFile(null);
// setPhotoPreview(p.imageUrl || null);
// Let's add setPhotoBase64(null) there.
updatedContent = updatedContent.replace(
  "setPhotoPreview(p.imageUrl || null);",
  "setPhotoPreview(p.imageUrl || null);\n                                    setPhotoBase64(null);"
);

// When cancel is clicked in the product modal:
// setShowProductModal(false); setPhotoFile(null); setPhotoPreview(null);
// Let's replace it with:
// setShowProductModal(false); setPhotoFile(null); setPhotoPreview(null); setPhotoBase64(null);
updatedContent = updatedContent.replace(
  "setShowProductModal(false); setPhotoFile(null); setPhotoPreview(null);",
  "setShowProductModal(false); setPhotoFile(null); setPhotoPreview(null); setPhotoBase64(null);"
);

fs.writeFileSync(filePath, updatedContent, 'utf8');
console.log("Optimization successfully completed!");
