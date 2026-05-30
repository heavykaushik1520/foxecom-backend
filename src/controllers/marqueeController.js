const { Op } = require("sequelize");
const { Marquee, sequelize } = require("../models");

function parseBoolean(value) {
  if (value === true || value === false) return value;
  if (typeof value === "number") return value === 1;
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (normalized === "true" || normalized === "1") return true;
    if (normalized === "false" || normalized === "0") return false;
  }
  return undefined;
}

async function getActiveMarquee(req, res) {
  try {
    const marquee = await Marquee.findOne({
      where: { isActive: true },
      order: [["updated_at", "DESC"], ["id", "DESC"]],
    });

    return res.status(200).json({
      success: true,
      marquee,
    });
  } catch (error) {
    console.error("getActiveMarquee:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch active marquee.",
    });
  }
}

async function getAllMarquees(req, res) {
  try {
    const marquees = await Marquee.findAll({
      order: [["created_at", "DESC"], ["id", "DESC"]],
    });

    return res.status(200).json({
      success: true,
      marquees,
    });
  } catch (error) {
    console.error("getAllMarquees:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch marquees.",
    });
  }
}

async function createMarquee(req, res) {
  const trx = await sequelize.transaction();
  try {
    const text = String(req.body?.text || "").trim();
    const isActive = parseBoolean(req.body?.isActive) ?? false;

    if (!text) {
      await trx.rollback();
      return res.status(400).json({
        success: false,
        message: "Marquee text is required.",
      });
    }

    if (isActive) {
      await Marquee.update({ isActive: false }, { where: {}, transaction: trx });
    }

    const marquee = await Marquee.create(
      {
        text,
        isActive,
      },
      { transaction: trx }
    );

    await trx.commit();
    return res.status(201).json({
      success: true,
      marquee,
    });
  } catch (error) {
    await trx.rollback();
    console.error("createMarquee:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to create marquee.",
    });
  }
}

async function updateMarquee(req, res) {
  const trx = await sequelize.transaction();
  try {
    const id = Number(req.params.id);
    const marquee = await Marquee.findByPk(id, { transaction: trx });

    if (!marquee) {
      await trx.rollback();
      return res.status(404).json({
        success: false,
        message: "Marquee not found.",
      });
    }

    if (req.body?.text !== undefined) {
      const text = String(req.body.text || "").trim();
      if (!text) {
        await trx.rollback();
        return res.status(400).json({
          success: false,
          message: "Marquee text cannot be empty.",
        });
      }
      marquee.text = text;
    }

    if (req.body?.isActive !== undefined) {
      const isActive = parseBoolean(req.body.isActive);
      if (isActive === undefined) {
        await trx.rollback();
        return res.status(400).json({
          success: false,
          message: "Invalid isActive value. Use true or false.",
        });
      }
      if (isActive) {
        await Marquee.update(
          { isActive: false },
          { where: { id: { [Op.ne]: id } }, transaction: trx }
        );
      }
      marquee.isActive = isActive;
    }

    await marquee.save({ transaction: trx });
    await trx.commit();

    return res.status(200).json({
      success: true,
      marquee,
    });
  } catch (error) {
    await trx.rollback();
    console.error("updateMarquee:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to update marquee.",
    });
  }
}

async function toggleMarqueeStatus(req, res) {
  const trx = await sequelize.transaction();
  try {
    const id = Number(req.params.id);
    const marquee = await Marquee.findByPk(id, { transaction: trx });

    if (!marquee) {
      await trx.rollback();
      return res.status(404).json({
        success: false,
        message: "Marquee not found.",
      });
    }

    const requestedState = parseBoolean(req.body?.isActive);
    const nextState = requestedState !== undefined ? requestedState : !Boolean(marquee.isActive);
    if (nextState) {
      await Marquee.update(
        { isActive: false },
        { where: { id: { [Op.ne]: id } }, transaction: trx }
      );
    }

    marquee.isActive = nextState;
    await marquee.save({ transaction: trx });
    await trx.commit();

    return res.status(200).json({
      success: true,
      marquee,
    });
  } catch (error) {
    await trx.rollback();
    console.error("toggleMarqueeStatus:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to toggle marquee status.",
    });
  }
}

async function deleteMarquee(req, res) {
  try {
    const id = Number(req.params.id);
    const deleted = await Marquee.destroy({ where: { id } });

    if (!deleted) {
      return res.status(404).json({
        success: false,
        message: "Marquee not found.",
      });
    }

    return res.status(200).json({
      success: true,
      message: "Marquee deleted successfully.",
    });
  } catch (error) {
    console.error("deleteMarquee:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to delete marquee.",
    });
  }
}

module.exports = {
  getActiveMarquee,
  getAllMarquees,
  createMarquee,
  updateMarquee,
  toggleMarqueeStatus,
  deleteMarquee,
};
