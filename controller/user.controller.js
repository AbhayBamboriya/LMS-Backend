// import { FSWatcher } from "vite";
import User from "../models/user.model.js";
import AppError from "../utils/error.util.js";
import cloudinary from 'cloudinary'
import fs from 'fs/promises'
import crypto from 'crypto'
import sendEmail from "../utils/sendEmail.js";
const cookieOptions={
    maxAge:7*24*60*60*1000,//multiply by 1000 for milisecond and it will be present for 7 days\
    httpOnly:true,
    secure:true 
}
const register  = async(req,res,next)=>{
    const {fullName,email,password}=req.body;
    if(!fullName || !email || !password){
        return next(new AppError('All fields are Required',400))
    }
    const userExists = await User.findOne({email})
    if(userExists){
        return next(new AppError('Email already exist',400))
    }

    const user =await User.create({
        fullName,
        email,
        password,
        avatar:{
            public_id:email,
            secure_url:'https://www.bing.com/ck/a?!&&p=4edbbb4305760339JmltdHM9MTcwNzk1NTIwMCZpZ3VpZD0zMDE0ODI5Ny0wMDc0LTY5NzgtMDUyZS05MmU3MDFlZjY4NDYmaW5zaWQ9NTQ3OQ&ptn=3&ver=2&hsh=3&fclid=30148297-0074-6978-052e-92e701ef6846&u=a1L2ltYWdlcy9zZWFyY2g_cT1pbWFnZSZpZD1GRkMwM0U2OTY2M0YyNzgyN0M2MTk4QTAyQTFGMjZCNkUyN0E0MEY4JkZPUk09SVFGUkJB&ntb=1'
        }
    })
    // if not user doesnot stred succcessfully 
    if(!user){
        return next(new AppError('User registration is failed please try again',400))
    }

    // these file we will get from bi=ody after the avatar is converted to binary
    if(req.file){
        console.log('File deatils-> ',JSON.stringify(req.file));
        try{
            const result=await cloudinary.v2.uploader.upload(req.file.path,{
                // at which folder you have to upload the image
                folder:'lms',
                width:250,
                height:250,
                // gravity is used to auto focus
                gravity:'faces',
                crop:'fill'
            })
            if(result){
                user.avatar.public_id=result.public_id
                user.avatar.secure_url=result.secure_url    
                
                // remove file from local system/server
                fs.rm(`uploads/${req.file.filename}`)

            }
        }catch(e){
            return next(
                new AppError(error || 'File not uploaded,please try again',500)
            )
        }
    }
    // ater registration for dirctly login thatswyh used jwt token
    const token=await user.generateJWTToken()
    res.cookie('token',token,cookieOptions)
    // TODO: file upload
    await user.save()
    user.password=undefined
    res.status(201).json({
        success:true,
        message:"User registered successfully",
        user

    })
}

const login=async(req,res)=>{
    try{
        const {email,password}=req.body;
        if(!email || !password){
            return next (new AppError('All fields are required',400))
        }
        const user=await User.findOne({email}).select('+password')
        if(!user || !user.comparePassword(password)){
            return next(new AppError('Email and Password doesnot match',400))
        }
        const token=await user.generateJWTToken()
        user.password=undefined
        res.cookie('token',token,cookieOptions)
        res.status(200).json({
            success:true,
            message:"User loged in successfully",
            user
        })
    }
    catch(e){
        return next(new AppError(e.message,500))
    }
    
}
const logout=(req,res)=>{
    res.cookie('token',null,{
        secure:true,
        maxAge:0,
        httpOnly:true
    })
    res.status(200).json({
        success:true,
        message:"User Logged out successfully"
    })
}

const getProfile=async(req,res)=>{
    const userId = req.user.id
    const user=await User.findById(userId)
    try{
        const userId = req.user.id
        const user=await User.findById(userId)
        res.status(200).json({
            success:true,
            message:"User Details",
            user
        })
    }
    catch(e){
        return next(new AppError("falied to get the information",400))
    }

}

const forgotPassword=async(req,res,next)=>{
    const {email}=req.body;
    if(!email){
        return next(new AppError('Email is require',400))
    }
    const user=await User.findOne({email})
    if(!user){
        return next(new AppError('Enter registered email',400))
    }
      // Generating the reset token via the method we have in user model
    const resetToken=await user.generatePasswordResetToken()
    // saving the token to db
    await user.save()

    // const resetPasswordUrl=`${process.env.FRONTEND_URL}/reset-password/${resetToken}`
    const message= `URL`
    const subject='Reset Password';
    try{
        await sendEmail(email,subject,message)
        res.status(200).json({
            success:true,
            message:`Reset Password token has been send to ${email} successfully`
        })
    }
    catch(e){
        user.forgotPasswordExpiry=undefined
        user.forgotPasswordToken=undefined
        await user.save()
        return next(new AppError(toString(e).message,500))
    }
}
const resetPassword=async(req,res)=>{
    const {resetToken} = req.params;
    const{password}=req.body
    const forgotPasswordToken=crypto
        .createHash('sha256')
        .update(resetToken)
        .digest('hex')
    const user = await User.findOne({
        // that token is existing or not
        forgotPasswordToken,
        forgotPasswordExpiry:{$gt: Date.now()}
    })
    if(!user){
        return next(
            new AppError('Token is invalid please try again',400)
        )
    }

    user.password=password;
    user.forgotPasswordExpiry=undefined
    user.forgotPasswordToken=undefined
    user.save();
    res.status(200).json({
        success:true,
        message:'Password changed successfully'
    })
}

const changePassword=async(req,res)=>{
    const {oldpassword,newpassword}= req.body
    const {id}=req.user
    if(!oldpassword || !newpassword){
        return next(
            new AppError('All filds are mandatory',400)
        )
    }

    const user = await User.findById(id).select('+password')
    if(!user){
        return next(
            new AppError('User does not exist',400)
        )

    }
    const isPasswordValid=await user.comparePassword(oldpassword)
    if(!isPasswordValid){
        return next(
            new AppError('Invalid old password',400)
        )

    }
    user.password=newpassword
    await user.save()   //to save the changes in db
    user.password=undefined
    res.status(200).json({
        success:true,
        message:'Password changed successfully'
    })
}

const updateUser=async(req,res)=>{
    const {fullName}=req.body
    const{id}=req.user.id
    const user=await User.findById(id);
    if(!user){
        return next(
            new AppError('User does not exist',400)
        )

    }
    if(req.fullName){
        user.fullName=fullName
    }
    // update the avatar
    if(req.file){
        // destroying the existing image
        await cloudinary.v2.uploader.destroy(user.avatar.public_id)

        
            try{
                const result=await cloudinary.v2.uploader.upload(req.file.path,{
                    // at which folder you have to upload the image
                    folder:'lms',
                    width:250,
                    height:250,
                    // gravity is used to auto focus
                    gravity:'faces',
                    crop:'fill'
                })
                if(result){
                    user.avatar.public_id=result.public_id
                    user.avatar.secure_url=cloudinary.secure_url    
    
                    // remove file from local system/server
                    fs.rm(`uploads/${req.file.filename}`)
    
                }
            }catch(e){
                return next(
                    new AppError(error || 'File not uploaded,please try again',500)
                )
            }
        
    }

    await user.save()
    res.status(200).json({
        success:true,
        message:"Changes are uploaded successfully"
    })
}

// }
export{
    register,
    getProfile,
    logout,
    updateUser,
    login,
    forgotPassword,
    // resetPassword,
    changePassword
}