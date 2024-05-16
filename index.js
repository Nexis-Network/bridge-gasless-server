require('dotenv').config()
const { ethers } = require("ethers");
const express = require("express");
const rateLimit = require("express-rate-limit");

const app = express();
app.use(express.json()); 
const limiter = rateLimit({
  windowMs: 60 * 1000,
  max: 5,
  message: {
    status: 429,
    data: {
      message: "Too many requests, please try again later."
    }
  }
});

app.use(limiter);

const providerUrl =process.env.RPC;
const privateKey = process.env.PRIVATE_KEY;
const port = process.env.PORT;
const minSecsPerReq =process.env.MIN_SEC_PER_REQ; 
const minHrsPerReq = process.env.MIN_HRS_PER_REQ;

const bNztAddress = process.env.ERC20_ADDR;


const bNztABI = [
  {
    "constant": true,
    "inputs": [{ "name": "who", "type": "address" }],
    "name": "balanceOf",
    "outputs": [{ "name": "", "type": "uint256" }],
    "type": "function"
  }
];

const provider = new ethers.providers.JsonRpcProvider(providerUrl);
const wallet = new ethers.Wallet(privateKey, provider);

let userRequests = {}

app.get("/", (req, res) => {
  res.json({
    status:200,
    data:{
      message:"meta tx v1 running"
    }
  });
})

app.post("/unwrap", async (req, res) => {
  // take from req.body
  const {userAddress,timestamp} = req.body;

  // Validate user address
  if (!ethers.utils.isAddress(userAddress)) {
    res.status(400).json({ status: 400, data: { message: "Invalid user address" } });
    return;
  }

  const currentTimestamp = Date.now()

  // check if signature is generated 30 seconds ago or not
  if (currentTimestamp - timestamp > 0 && currentTimestamp - timestamp < minSecsPerReq * 1000) {
    // check if user requested tokens in 1 hour
    if (userRequests[userAddress] && currentTimestamp - userRequests[userAddress] < 60 * 1000 * 60 * minHrsPerReq) {
      // if user requested already an hour ago , revert
      res.send({
        status: 400,
        data: {
          message: "hourly gasless limit exceeded"
        }
      });
      return;
    }

    // if user's last request time doesnt exist update here
    userRequests[userAddress] = currentTimestamp;

    // check balance of user, if greater than 0 revert
    const userBalance = await provider.getBalance(userAddress);
    if (ethers.BigNumber.from(parseInt(ethers.utils.formatEther(userBalance).toString()).toString()).gt(ethers.BigNumber.from("1"))) {
      res.send({
        status: 400,
        data: {
          message: "you already have minimum balance to pay fees",
          balance:userBalance.toString()
        }
      });
      return;
    }

    // check if user owns bNzt
    const bnztContract = new ethers.Contract(bNztAddress, bNztABI, provider);
    console.log(bnztContract)
    const userNztBalance = await bnztContract.balanceOf(userAddress);

    // if not owning bnzt revert
    if (ethers.utils.formatUnits(userNztBalance, 18).isZero()) {
      res.send({
        status: 400,
        data: {
          message: "you don't own any bNzt"
        }
      });
      return;
    }
    const amount = ethers.utils.parseEther("0.1")
    const tx = await wallet.sendTransaction({
      to: userAddress,
      value: amount
    });
    res.json({
      status: 200,
      data: {
        message: "transaction successful",
        tx
      }
    })

  }
  // if old signature, dont proceed
  else {
    res.json({
      status: 400,
      data: {
        message: "can't use old signature"
      }
    })
  }
})

app.listen(port, () => {
  console.log(`running on http://localhost:${port}`)
})
