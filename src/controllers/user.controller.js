import { Mongoose } from "mongoose";
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

const changePassword = asyncHandler(async(req, res) => {
    const {newPassword, oldPassword} = req.body;
    const user = await User.findById(req.user._id)
    const isPasswordCorrect = await user.isPasswordCorrect(oldPassword)
    if(!isPasswordCorrect) {
        throw new ApiError(400, "Password entered is Invalid")
    }
    user.password = newPassword
    await user.save({validateBeforeSave: false})

    return res.status(200).json(new ApiResponse(200, {}, "Password Changed Successfully"))
})

const getCurrentUser = asyncHandler(async(req, res) => {
    return res.status(200).json(200, res.user, "user fetched Successfully")
})

const updateUserDetails = asyncHandler(async(req, res) => {
    const { fullname, email} = req.body

    if(!(fullname || email)) {
        throw new ApiError(400, "All Fields are Required")
    }

    const updatedUser = await User.findByIdAndUpdate(req.user._id, {$set: {fullname, email}}, {new: true}).select("-password")

    return res.status(200).json(new ApiResponse(200, updatedUser, "Details Updated"))
})

const updateUserAvatar = asyncHandler(async(req, res) => {
    const avatarLocalPath = req.file?.path;
    if(!avatarLocalPath) {
        throw new ApiError(400, "Avatar file is missing")
    }

    const avatar = await uploadToCloudinary(avatarLocalPath)

    if(!avatar.url) {
        throw new ApiError(400, "Error while uploading avatar")
    }

    const updatedResult = await User.findByIdAndUpdate(req.user._id,{$set: {avatar: avatar.url}}, {new: true}).select("-password")

    return res.status(200).json(new ApiResponse(200, updatedResult, "Avatar Updated"))
})

const getUserChannelProfile = asyncHandler(async(req, res) => {
    const {username} = req.params
    if(!username) {
        throw new ApiError(400, "Username not defined")
    }
    const channel = await User.aggregate([
        {
            $match: {
                username: username
            }
        },
        {
            $lookup: {
                from : "subscriptions",
                localField: "_id",
                foreignField: "channel",
                as: "subscribers"
            }
        },
        {
            $lookup: {
                from : "subscriptions",
                localField: "_id",
                foreignField: "subscriber",
                as: "subscribedTo"
            }
        },
        {
            $addFields: {
                subscribersCount: {
                    $size: "$subscribers"
                },
                subscribedToCount: {
                    $size: "$subscribedTo"
                },
                isSubscribed: {
                    $cond: {
                        if: {$in: [req.user?._id, "$subscribers.subscriber"]},
                        then: true,
                        else: false
                    }
                }
            }
        },
        {
            $project: {
                fullname: 1,
                username: 1,
                subscribersCount: 1,
                subscribedToCount: 1,
                isSubscribed: 1,
                avatar: 1,
                email: 1
            }
        }
    ])

    if(!channel?.length) {
        throw new ApiError(404, "channel doesnot exixt")
    }

    return res.status(200).json(new ApiResponse(200, channel[0], "User channel fetched successfully"))
})

const getWatchHistory = asyncHandler(async(req, res) => {
    const user = await User.aggregate([
        {
            $match: {
                _id: new mongoose.Types.ObjectId(req.user._id)
            }
        },
        {
            $lookup: {
                from: "videos",
                localField: "watchHistory",
                foreignField: "_id",
                as: "watchHistory",
                pipeline: [
                    {
                        $lookup: {
                            from: "users",
                            localField: "owner",
                            foreignField: "_id",
                            as: "owner",
                            pipeline: [
                                {
                                    $project: {
                                        fullname: 1,
                                        email: 1,
                                        username: 1,
                                        avatar: 1
                                    }
                                },
                                {
                                    $addFields: {
                                        owner: {
                                            $first: $owner
                                        }
                                    }
                                }
                            ]
                        }
                    }
                ]
            }
        }
    ])

    return res.status(200).json(new ApiResponse(200, user[0].getWatchHistory, "Watch history fetched!"))
})

export { registerUser, loginUser, logOutUser, refreshAccessToken, changePassword, getCurrentUser, updateUserDetails, updateUserAvatar, getUserChannelProfile, getWatchHistory }