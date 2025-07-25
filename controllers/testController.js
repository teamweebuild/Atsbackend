import asyncHandler from "express-async-handler";
import TestInstance from "../models/TestInstance.js";
import Vehicle from "../models/Vehicle.js";
import VisualTest from "../models/VisualTest.js";
import FunctionalTest from "../models/FunctionalTest.js";
import { checkAndMarkCompleted } from "../Helpers/Helper.js";

// @desc Start test instance
// @route POST /api/test/start
// @access Technician
// export const startTestInstance = asyncHandler(async (req, res) => {
//   const { regnNo } = req.body;

//   const vehicle = await Vehicle.findOne({ regnNo });
//   if (!vehicle) {
//     res.status(404);
//     throw new Error("Vehicle not found");
//   }

//   const existing = await TestInstance.findOne({ vehicle: vehicle._id });
//   if (existing) {
//     res.status(400);
//     throw new Error("Test instance already exists");
//   }

//   const testInstance = await TestInstance.create({
//     bookingId: vehicle.bookingId,
//     vehicle: vehicle._id,
//     status: "IN_PROGRESS",

//     submittedBy: req.user._id,
//   });

//   vehicle.status = "IN_PROGRESS";
//   await vehicle.save();

//   res.status(201).json(testInstance);
// });
export const startTestInstance = asyncHandler(async (req, res) => {
  const { regnNo } = req.body;

  const vehicle = await Vehicle.findOne({ regnNo });
  if (!vehicle) {
    res.status(404);
    throw new Error("Vehicle not found");
  }

  const existing = await TestInstance.findOne({ vehicle: vehicle._id });
  if (existing) {
    res.status(400);
    throw new Error("Test instance already exists");
  }

  // ✅ Create VisualTest & FunctionalTest first
  const visualTest = await VisualTest.create({
    bookingId: vehicle.bookingId,
    vehicle: vehicle._id,
  });

  const functionalTest = await FunctionalTest.create({
    bookingId: vehicle.bookingId,
    vehicle: vehicle._id,
  });

  // ✅ Then create TestInstance and reference the above
  const testInstance = await TestInstance.create({
    bookingId: vehicle.bookingId,
    vehicle: vehicle._id,
    visualTest: visualTest._id,
    functionalTest: functionalTest._id,
    status: "IN_PROGRESS",
    submittedBy: req.user._id,
  });

  vehicle.status = "IN_PROGRESS";
  await vehicle.save();

  res.status(201).json(testInstance);
});



// @route   GET /api/test/visual/pending
// @access  Private (Technician / Admin)
export const getPendingVisualTests = asyncHandler(async (req, res) => {
  const vehicles = await Vehicle.find({ atsCenter: req.user.atsCenter });

  const pendingVisuals = [];

  for (const vehicle of vehicles) {
    const visualTest = await VisualTest.findOne({ vehicle: vehicle._id });
    if (!visualTest || visualTest.isCompleted === false) {
      pendingVisuals.push(vehicle.regnNo);
    }
  }

  res.json({ pending: pendingVisuals });
});



// @route   POST /api/test/visual/submit
// @access  Private (Technician)
export const submitVisualTest = asyncHandler(async (req, res) => {
  const { regnNo, rules } = req.body;
  console.log("Submitting visual test for:", regnNo, "with rules:", rules);
  if (!regnNo || !rules || typeof rules !== "object") {
    res.status(400);
    throw new Error("regnNo and visual rules are required");
  }

  const vehicle = await Vehicle.findOne({ regnNo });
  if (!vehicle) {
    res.status(404);
    throw new Error("Vehicle not found");
  }

  let visualTest = await VisualTest.findOne({ vehicle: vehicle._id });

  if (!visualTest) {
    visualTest = new VisualTest({
      vehicle: vehicle._id,
      bookingId: vehicle.bookingId,
    });
  }

  // Assign all rule values
  for (const key in rules) {
    if (visualTest.schema.path(key)) {
      visualTest[key] = rules[key];
    }
  }

  visualTest.isCompleted = true;
  await visualTest.save();
 await checkAndMarkCompleted(regnNo)

  res.status(200).json({ message: "Visual test submitted successfully" });
});



// GET /api/tests/functional/pending/:rule
// export const getPendingFunctionalTestsByRule = async (req, res) => {
//   const { rule } = req.params;

//   if (!rule) return res.status(400).json({ message: "Rule parameter is required" });

//   try {
//     // const pendingTests = await FunctionalTest.find({ [rule]: "NA" })
//     //   .populate("vehicle", "regnNo engineNo chassisNo bookingId");
//     // const pendingV=await TestInstance.find().populate(["functionalTest","vehicle"])
//     // console.log(pendingV)
//     const pendingTests=await FunctionalTest.find().populate("vehicle");
//     // const vehicles = pendingTests.map(test => test.vehicle.regnNo);
//     //  console.log(vehicles)
//     console.log(pendingTests)
//     res.json(pendingTests);
//   } catch (error) {
//     console.error("Error fetching pending functional tests:", error);
//     res.status(500).json({ message: "Server error" });
//   }
// };

// Example: Get all vehicles where rule189_4 === "NA"
export const getPendingFunctionalTestsByRule = asyncHandler(async (req, res) => {
  const { rule } = req.params;
  if (!rule) return res.status(400).json({ message: "Rule parameter is required" });

  const tests = await FunctionalTest.find({ [rule]: "NA", isCompleted: false })
    .populate("vehicle", "regnNo engineNo chassisNo bookingId");
 console.log(tests.map(test => test.vehicle.regnNo))
  res.json(tests.map(test => test.vehicle.regnNo));
});

// POST /api/tests/functional/submit
export const submitFunctionalTest = async (req, res) => {
  const { regnNo, rule, value } = req.body;

  if (!regnNo || !rule || value == null)
    return res.status(400).json({ message: "regnNo, rule, and value are required" });

  try {
    const vehicle = await Vehicle.findOne({ regnNo });
    if (!vehicle) return res.status(404).json({ message: "Vehicle not found" });

    const test = await FunctionalTest.findOne({ vehicle: vehicle._id });
    if (!test) return res.status(404).json({ message: "Functional test not found for vehicle" });

    test[rule] = value;

    // Check if all rules are completed (no more 'NA')
    const allFields = Object.keys(test.toObject()).filter(
      (key) => key.startsWith("rule189_") // only check rule fields
    );
    const incomplete = allFields.some((key) => test[key] === "NA");

    test.isCompleted = !incomplete;
    await test.save();
   await checkAndMarkCompleted(regnNo);
    res.json({ message: `Functional test for ${regnNo} updated`, isCompleted: test.isCompleted });
    
  } catch (error) {
    console.error("Error submitting functional test:", error);
    res.status(500).json({ message: "Server error" });
  }
};








// @desc Submit test result (visual or functional)
// @route POST /api/test/submit
// @access Technician

// for now we will not implement this function

// export const submitTestResult = asyncHandler(async (req, res) => {
//   const { regnNo, visualTests, functionalTests } = req.body;

//   const vehicle = await Vehicle.findOne({ regnNo });
//   if (!vehicle) {
//     res.status(404);
//     throw new Error("Vehicle not found");
//   }

//   const testInstance = await TestInstance.findOne({ vehicle: vehicle._id });
//   if (!testInstance) {
//     res.status(404);
//     throw new Error("Test instance not found");
//   }

//   if (visualTests) {
//     testInstance.visualTests = {
//       ...testInstance.visualTests,
//       ...visualTests,
//     };
//   }

//   if (functionalTests) {
//     testInstance.functionalTests = {
//       ...testInstance.functionalTests,
//       ...functionalTests,
//     };
//   }

//   await testInstance.save();

//   res.status(200).json({
//     message: "Test result updated",
//     status: testInstance.status,
//   });
// });

// @desc Get test status by regnNo
// @route GET /api/test/:regnNo/status
// @access Private
export const getTestStatusByBookingId = asyncHandler(async (req, res) => {
  const { regnNo } = req.params;

  const vehicle = await Vehicle.findOne({ regnNo });
  if (!vehicle) {
    res.status(404);
    throw new Error("Vehicle not found");
  }

  const testInstance = await TestInstance.findOne({ vehicle: vehicle._id }).populate(
    "submittedBy",
    "name role"
  );

  if (!testInstance) {
    res.status(404);
    throw new Error("Test instance not found");
  }

  res.json({
    bookingId: testInstance.bookingId,
    status: testInstance.status,
    visualTests: testInstance.visualTests || {},
    functionalTests: testInstance.functionalTests || {},
    submittedBy: testInstance.submittedBy || null,
  });
});

// @desc Get all test instances by technician's center
// @route GET /api/test/center/all
// @access ATS_ADMIN
export const getTestInstancesByCenter = asyncHandler(async (req, res) => {
  const atsCenterId = req.user.atsCenter;

  const vehicles = await Vehicle.find({ atsCenter: atsCenterId }).select("_id");

  const testInstances = await TestInstance.find({
    vehicle: { $in: vehicles.map((v) => v._id) },
  })
    .populate("vehicle", "regnNo bookingId status")
    .populate("submittedBy", "name role");

  res.json(testInstances);
});

// @desc Mark test as complete (manual trigger)
// @route POST /api/test/complete
// @access Technician
export const markTestAsComplete = asyncHandler(async (req, res) => {
  const { regnNo } = req.body;

  const vehicle = await Vehicle.findOne({ regnNo });
  if (!vehicle) {
    res.status(404);
    throw new Error("Vehicle not found");
  }

  const testInstance = await TestInstance.findOne({ vehicle: vehicle._id });
  if (!testInstance) {
    res.status(404);
    throw new Error("Test instance not found");
  }

  const isVisualDone =
    testInstance.visualTests &&
    Object.keys(testInstance.visualTests).length > 0;
  const isFunctionalDone =
    testInstance.functionalTests &&
    Object.keys(testInstance.functionalTests).length > 0;

  if (!isVisualDone || !isFunctionalDone) {
    res.status(400);
    throw new Error("Both visual and functional tests must be submitted before completion.");
  }

  testInstance.status = "COMPLETED";
  await testInstance.save();

  vehicle.status = "COMPLETED";
  vehicle.laneExitTime = new Date();
  await vehicle.save();

  res.json({ message: "Test marked as completed successfully." });
});
