import { User } from "../models/user.model.js";
import { ApiError } from "../utils/apiError.js";
import { ApiResponse } from "../utils/apiResponse.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { uploadToCloudinary } from "../utils/cloudinary.js";
import jwt from "jsonwebtoken"

const generateAccessAndRefreshTokens = async(userId) => {
    try {
        const user = await User.findById(userId)
        const accessToken = user.generateAccessToken()
        const refreshToken = user.generateRefreshToken()
        user.refreshToken = refreshToken
        await user.save({ validateBeforeSave: false})
        return {accessToken, refreshToken}
    } catch (error) {
        throw new ApiError(500, "Something went wrong while generating refresh and access token")
    }
}

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

const loginUser = asyncHandler(async(req, res) => {
    const {email, username, password} = req.body
    if(!(username || email)) {
        throw new ApiError(400, "email or username is required")
    }

    const user = await User.findOne({$or: [{username}, {email}]})

    if(!user) {
        throw new ApiError(404, "User not found")
    }

    const isPasswordValid = await user.isPasswordCorrect(password)

    if(!isPasswordValid) {
        throw new ApiError(401, "Incorrect Password")
    }

    const {accessToken, refreshToken} = await generateAccessAndRefreshTokens(user._id)

    const loggedInUser = await User.findById(user._id).select("-password -refreshToken")

    const options = {
        httpOnly: true,
        secure: true
    }

    return res.status(200)
    .cookie("accessToken", accessToken, options)
    .cookie("refreshToken", refreshToken, options)
    .json(new ApiResponse(200, {user: loggedInUser, accessToken, refreshToken}, "User LoggedIn Successfully"))
}) 

const logOutUser = asyncHandler(async(req, res) => {
    await User.findByIdAndUpdate( req.user._id, {
        $set: {
            refreshToken: undefined,
            accessToken: undefined

        }, 
    }, {new: true})

    const options = {
        httpOnly: true,
        secure: true
    }

    return res.status(200)
    .clearCookie("accessToken", options)
    .clearCookie("refreshToken", options)
    .json(new ApiResponse(200, {}, "User LoggedOut"))
})

const refreshAccessToken = asyncHandler(async(req, res) => {
   try {
     const incomingRefreshToken = req.cookies.refreshAccessToken || req.body.refreshAccessToken
 
     if(!incomingRefreshToken) {
         throw new ApiError(401,"Unauthorized Request")
     }
 
     const deCodedToken = jwt.verify(incomingRefreshToken, process.env.REFRESH_TOKEN_SECRET)
 
     const user = await User.findById(deCodedToken?._id)
 
     if(!user) {
         throw new ApiError(401, "Invalid Refresh Token")
     }
 
     if(incomingRefreshToken !== user?.refreshToken) {
         throw new ApiError(401, "Refresh token is expired or used")
     }
 
     const options = {
         httpOnly: true,
         secure: true
     }
 
     const {accessToken, newRefreshToken} = await generateAccessAndRefreshTokens(user._id)
 
     return res.status(200)
     .cookie("accessToken", accessToken)
     .cookie("refreshToken", newRefreshToken)
     .json(new ApiResponse(200, {accessToken, refreshToken: newRefreshToken}, "Access token Refreshed" ))
   } catch (error) {
        throw new ApiError(401, error?.message || "Invalid Rfresh token")
   }

})

export { registerUser, loginUser, logOutUser, refreshAccessToken }