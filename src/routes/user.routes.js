import { Router } from "express"
import { changePassword, getCurrentUser, logOutUser, loginUser, refreshAccessToken, registerUser, updateUserAvatar, updateUserDetails } from "../controllers/user.controller.js";
import { upload } from "../middlewares/multer.middleware.js";
import { verifyJwt } from "../middlewares/auth.middleware.js";

const router = Router();

router.route("/register").post(
    upload.fields([{
        name: "avatar",
        maxCount: 1
    },{
        name: "coverImage",
        maxCount: 1
    }]),
    registerUser)

router.route("/login").post(loginUser)

// secured routes
router.route("/logout").post(verifyJwt, logOutUser)
router.route("/refresh-token").post(refreshAccessToken)
router.route("/change-password").post(verifyJwt, changePassword)
router.route("/get-current-user").post(verifyJwt, getCurrentUser)
router.route("/update-user-details").post(verifyJwt, updateUserDetails)
router.route("/update-avatar").post(verifyJwt, upload.single("avatar"),updateUserAvatar)


export default router