import mongoose, {Schema} from "mongoose";

const likeSchema = new Schema({
    video: {
        type: SchemaTypes.ObjectId,
        ref: "Video"
    },
    comment: {
        type: SchemaTypes.ObjectId,
        ref: "Comment"
    },
    tweet: {
        type: SchemaTypes.ObjectId,
        ref: "Tweet"
    },
    likedBy: {
        type: SchemaTypes.ObjectId,
        ref: "User"
    }
}, {timestamps: true})

export const Like = mongoose.model("Like", likeSchema)