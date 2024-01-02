import { User } from "../models/user.model.js";
import { ApiError } from "../utils/apiError.js";
import { ApiResponse } from "../utils/apiResponse.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { uploadToCloudinary } from "../utils/cloudinary.js";

const registerUser = asyncHandler(async(req, res) => {
    // Getting the data from frontend
    const {fullname, email, username, password} = req.body

    // Validations
    if([fullname, email, username, password].some((field) => field?.trim() === "")) {
        throw new ApiError(400, "All Fields are Required")
    }

    // Check if user alredy exists
    const existedUser = await User.findOne({$or: [{username}, {email}]})
    if(existedUser) {
        throw new ApiError(409, "Username or Email alredy exists")
    }
    // check if image is sent from frontend
    const avatarLocalPath = req.files?.avatar[0]?.path
    const coverImageLocalPath = req.files?.coverImage[0]?.path
    if(!avatarLocalPath) {
        throw new ApiError(400, "Avatar is required")
    }
    // Uploading image to Cloudinary and getting the image Url
   const avatar = await uploadToCloudinary(avatarLocalPath)
   const coverImage = await uploadToCloudinary(coverImageLocalPath)
    
    // Creating User
    const user = await User.create({username, email, fullname, password, avatar: avatar.url, coverImage: coverImage?.url || ""})
   
    // Check if user is created (optional)
    const createdUser = await User.findById(user._id).select("-password -refreshToken")
    if(!createdUser) {
        throw new ApiError(500, "Something went wrong while registering the user")
    }

    // returning proper response object
    return res.status(201).json(
        new ApiResponse(200, createdUser, "User Registered Successfully")
    )
})

export { registerUser }