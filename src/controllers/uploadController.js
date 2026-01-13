const fs = require('fs').promises;
const path = require('path');

exports.uploadBannerImage = async (req, res) => {
  try {
    // Multer will place the file info in req.file when using upload.single()
    if (!req.file) {
      return res.status(400).json({ success: false, message: 'No image file uploaded.' });
    }
    const imageUrl = `/uploads/images/${req.file.filename}`;

    res.status(200).json({
      success: true,
      message: 'Image uploaded successfully!',
      imageUrl: imageUrl // This is the URL the frontend needs to save
    });

  } catch (error) {
    console.error('Error in uploadBannerImage:', error);
    res.status(500).json({ success: false, message: 'Image upload failed.', error: error.message });
  }
};

// --- New Function: Delete Old Banner Image ---
exports.deleteOldImage = async (imagePath) => {
  if (!imagePath || imagePath === '') {
    return; // No path provided, nothing to delete
  }
  const absolutePath = path.join(__dirname, '..', '..', imagePath); 

  try {
    await fs.unlink(absolutePath);
    console.log(`Successfully deleted old image: ${absolutePath}`);
  } catch (error) {
    if (error.code === 'ENOENT') {
      console.warn(`Attempted to delete non-existent file: ${absolutePath}`);
    } else {
      console.error(`Error deleting old image ${absolutePath}:`, error);
    }
  }
};