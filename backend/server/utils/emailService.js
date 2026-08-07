const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
    }
});

const sendOTPEmail = async (email, otp, type = 'verify') => {
    try {
        let subject = '';
        let html = '';

        if (type === 'verify') {
            subject = 'Verify your Legal Query System Account';
            html = `
                <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e2e8f0; border-radius: 10px;">
                    <h2 style="color: #0f172a; text-align: center;">Welcome to Legal Query System!</h2>
                    <p style="color: #334155; font-size: 16px;">Thank you for signing up. To complete your registration, please enter the following 6-digit verification code:</p>
                    <div style="background-color: #f1f5f9; padding: 15px; border-radius: 8px; text-align: center; margin: 20px 0;">
                        <span style="font-size: 32px; font-weight: bold; color: #fbbf24; letter-spacing: 5px;">${otp}</span>
                    </div>
                    <p style="color: #64748b; font-size: 14px; text-align: center;">This code will expire in 10 minutes.</p>
                    <p style="color: #94a3b8; font-size: 12px; text-align: center; margin-top: 30px;">If you did not request this, please ignore this email.</p>
                </div>
            `;
        } else if (type === 'reset') {
            subject = 'Reset Your Password - Legal Query System';
            html = `
                <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e2e8f0; border-radius: 10px;">
                    <h2 style="color: #0f172a; text-align: center;">Password Reset Request</h2>
                    <p style="color: #334155; font-size: 16px;">We received a request to reset your password. Use the following 6-digit code to securely reset your password:</p>
                    <div style="background-color: #f1f5f9; padding: 15px; border-radius: 8px; text-align: center; margin: 20px 0;">
                        <span style="font-size: 32px; font-weight: bold; color: #10b981; letter-spacing: 5px;">${otp}</span>
                    </div>
                    <p style="color: #64748b; font-size: 14px; text-align: center;">This code will expire in 10 minutes.</p>
                    <p style="color: #94a3b8; font-size: 12px; text-align: center; margin-top: 30px;">If you did not request a password reset, please ignore this email. Your password is safe.</p>
                </div>
            `;
        }

        const mailOptions = {
            from: `"Legal Query System" <${process.env.EMAIL_USER}>`,
            to: email,
            subject: subject,
            html: html
        };

        const info = await transporter.sendMail(mailOptions);
        console.log('Email sent: ' + info.response);
        return true;
    } catch (error) {
        console.error('Error sending email:', error);
        return false;
    }
};

module.exports = { sendOTPEmail };
