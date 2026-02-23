-- Billboard banners CMS (optional: Sequelize sync creates this automatically)
CREATE TABLE IF NOT EXISTS banners (
  id INT AUTO_INCREMENT PRIMARY KEY,
  desktopImageUrl VARCHAR(500) NOT NULL,
  mobileImageUrl VARCHAR(500) NOT NULL,
  sortOrder INT NOT NULL DEFAULT 0,
  createdAt DATETIME NOT NULL,
  updatedAt DATETIME NOT NULL
);
