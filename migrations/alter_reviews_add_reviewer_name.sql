-- Migration: Convert reviews to admin-managed (reviewer name + optional userId)
-- Run this once if you have an existing reviews table with (productId, userId) unique constraint.
-- If your MySQL does not support ADD COLUMN IF NOT EXISTS, run only the ALTER for reviewerName
-- and ignore the IF NOT EXISTS part (or use one ALTER per column and skip if already present).

-- Step 1: Add reviewerName column
ALTER TABLE reviews ADD COLUMN IF NOT EXISTS reviewerName VARCHAR(255) NULL;

-- Step 2: Drop unique constraint so multiple reviews per product are allowed (admin can add many)
ALTER TABLE reviews DROP INDEX unique_user_product_review;

-- Step 3: Make userId nullable (reviews no longer require a user)
ALTER TABLE reviews MODIFY COLUMN userId INT NULL;
