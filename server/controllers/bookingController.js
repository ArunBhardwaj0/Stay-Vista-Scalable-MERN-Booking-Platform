import transporter from "../configs/nodemailer.js";
import Booking from "../models/Booking.js"
import Hotel from "../models/Hotel.js";
import Room from "../models/Room.js";
import Stripe from "stripe";



// Function to check Availabilty of Room
const checkAvailability = async ({checkInDate,checkOutDate,room})=>{
    try {
        const bookings = await Booking.find({
            room,
            checkInDate:{$lte:checkOutDate},
            checkOutDate:{$gte:checkInDate},
        });
      const isAvailable =  bookings.length === 0;
      return isAvailable;
    } catch (error) {
        console.log(error.message);
    }
}

// API to check availability of room 
// POST /api/bookings/check-availability
export const checkAvailabilityAPI = async (req,res) =>{
    try {
        const { room,checkInDate,checkOutDate} = req.body;
        const isAvailable = await checkAvailability({checkInDate,checkOutDate,room})
        res.json({success:true,isAvailable})
    } catch (error) {
            res.json({success:false,message:error.message})
    }
}

// API to create a new booking
// POST /api/bookings/book

export const createBooking = async (req,res) =>{
    try {
        const { room,checkInDate,checkOutDate,guests} = req.body;
        const user = req.user._id;
        // Before booking check availablity
        const isAvailable = await checkAvailability({checkInDate,checkOutDate,room})
        
        if(!isAvailable){
            return res.json({success:false,message:"Room is not available"})
        }

        // Get total price from room
        const roomData = await Room.findById(room).populate('hotel')
        let totalPrice = roomData.pricePerNight;

        // Calculate totalprice based on nights
        const checkIn = new Date(checkInDate)
        const checkOut = new Date(checkOutDate)
        const timeDiff = checkOut.getTime()-checkIn.getTime();
        const nights = Math.ceil(timeDiff / (1000 * 3600 * 24 ));

        totalPrice *= nights;
        const booking = await Booking.create({
            user,
            room,
            hotel:roomData.hotel._id,
            guests : +guests,
            checkInDate,
            checkOutDate,
            totalPrice,
        })

       const mailOptions = {
  from: process.env.SENDER_EMAIL,
  to: req.user.email,
  subject: "Your GoStay Booking Confirmation",
  html: `
  <div style="font-family: Arial, sans-serif; max-width: 600px; margin: auto; border:1px solid #e0e0e0; padding:20px; border-radius:10px; background-color:#f9f9f9;">
    <h1 style="color:#1a73e8; text-align:center;">GoStay</h1>
    <h2 style="color:#333;">Your Booking Details</h2>
    <p>Dear <strong>${req.user.username}</strong>,</p>
    <p>Thank you for choosing <strong>GoStay</strong>! Here are your booking details:</p>
    
    <table style="width:100%; border-collapse: collapse; margin-top: 15px;">
      <tr>
        <td style="padding: 8px; border: 1px solid #ddd;"><strong>Booking ID:</strong></td>
        <td style="padding: 8px; border: 1px solid #ddd;">${booking._id}</td>
      </tr>
      <tr style="background-color:#f2f2f2;">
        <td style="padding: 8px; border: 1px solid #ddd;"><strong>Hotel Name:</strong></td>
        <td style="padding: 8px; border: 1px solid #ddd;">${roomData.hotel.name}</td>
      </tr>
      <tr>
        <td style="padding: 8px; border: 1px solid #ddd;"><strong>Location:</strong></td>
        <td style="padding: 8px; border: 1px solid #ddd;">${roomData.hotel.address}</td>
      </tr>
      <tr style="background-color:#f2f2f2;">
        <td style="padding: 8px; border: 1px solid #ddd;"><strong>Date:</strong></td>
        <td style="padding: 8px; border: 1px solid #ddd;">${booking.checkInDate.toDateString()}</td>
      </tr>
      <tr>
        <td style="padding: 8px; border: 1px solid #ddd;"><strong>Booking Amount:</strong></td>
        <td style="padding: 8px; border: 1px solid #ddd;">${process.env.CURRENCY || '$'} ${booking.totalPrice}</td>
      </tr>
    </table>

    <p style="margin-top: 20px;">We look forward to welcoming you! If you need to make any changes, feel free to contact us.</p>
    
    <p style="text-align:center; color:#888; font-size:12px; margin-top:30px;">
      &copy; ${new Date().getFullYear()} GoStay. All rights reserved.
    </p>
  </div>
  `
};


        await transporter.sendMail(mailOptions)

        res.json({ success:true,message:"Booking created successfully"})



    } catch (error) {
            console.log(error)
            res.json({success:false,message:"Failed to create booking"})
    }
}


// API to get all bookings for a user
// GET /api/bookings/user

export const getUserBookings = async (req,res) =>{
    try {
      const user = req.user._id;
      const bookings = await Booking.find({user}).populate("room hotel").sort({createdAt:-1})
      res.json({success:true,bookings})
    } catch (error) {
            res.json({success:false,message:"Failed to fetch bookings"})
    }
}

// API to get all bookings for a hotel
// GET /api/bookings/hotel
export const getHotelBookings = async (req,res) =>{
   try {
     const hotel = await Hotel.findOne({owner:req.auth.userId});
    if(!hotel){
        return res.json({success:false,message:"No hotel found"});
    }
    const bookings = await Booking.find({hotel:hotel._id}).populate("room hotel user").sort({createdAt:-1})
    //Total Bookings
    const totalBookings = bookings.length;
    //Total Revenue

    const totalRevenue = bookings.reduce((acc,booking)=>acc+booking.totalPrice,0)
     res.json({success:true,dashboardData:{totalBookings,totalRevenue,bookings}})
   } catch (error) {
    res.json({success:false,message:"Failed to fetch bookings"})
   }
}


// export const stripePayment = async (req,res) =>{
//     try {
//         const {bookingId} = req.body;

//         const booking = await Booking.findById(bookingId);
//         const roomData = await Room.findById(booking.room).populate('hotel');
//         const totalPrice = booking.totalPrice;
//         const {origin} = req.headers;

//         const stripeInstance = new Stripe(process.env.STRIPE_SECRET_KEY);

//         const line_items = [
//             {
//                 price_data:{
//                     currency:"usd",
//                     product_data:{
//                         name:roomData.hotel.name,
//                     },
//                     unit_amount: totalPrice * 100
//                 },
//                 quantity:1,
//             }
//         ]
//         const session = await stripeInstance.checkout.sessions.create({
//             line_items,
//             mode:"payment",
//             success_url:`${origin}/loader/my-bookings`,
//             cancel_url:`${origin}/my-bookings`,
//             metadata:{
//                 bookingId,
//             }
//         })
//       res.json({success:true,url:session.url})

//     } catch (error) {
//         res.json({success:false,message:"Payment Failed"})
//     }
// }
// backend/controllers/paymentController.js


export const stripePayment = async (req, res) => {
  try {
    const { bookingId } = req.body;

    // 1️⃣ Fetch Booking
    const booking = await Booking.findById(bookingId);
    if (!booking) {
      return res.status(404).json({ success: false, message: "Booking not found" });
    }

    // 2️⃣ Fetch Room and populate hotel
    const roomData = await Room.findById(booking.room).populate("hotel");
    if (!roomData) {
      return res.status(404).json({ success: false, message: "Room not found" });
    }
    if (!roomData.hotel) {
      return res.status(404).json({ success: false, message: "Hotel not found" });
    }

    // 3️⃣ Prepare Stripe
    const stripeInstance = new Stripe(process.env.STRIPE_SECRET_KEY);
    const { origin } = req.headers;
    const totalPrice = booking.totalPrice;

    const line_items = [
      {
        price_data: {
          currency: "usd",
          product_data: {
            name: roomData.hotel.name,
          },
          unit_amount: totalPrice * 100, // in cents
        },
        quantity: 1,
      },
    ];

    // 4️⃣ Create Checkout Session
    const session = await stripeInstance.checkout.sessions.create({
      line_items,
      mode: "payment",
      success_url: `${origin}/loader/my-bookings`,
      cancel_url: `${origin}/my-bookings`,
      metadata: { bookingId }, // this is critical for webhook
    });

    // 5️⃣ Return session URL to frontend
    res.json({ success: true, url: session.url });
  } catch (error) {
    console.error("Stripe Payment Error:", error);
    res.status(500).json({ success: false, message: "Payment Failed" });
  }
};
